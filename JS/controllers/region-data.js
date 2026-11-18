import { DATASET_DEFINITIONS, EXTRA_DATASET_KEYS, REGIONS, normalise } from "../data/index.js";

export function createRegionDataController({
  $, state, loadRegionalData, clearArchiveCache,
  scheduleSuggestions, renderCsvReaderPage, loadCsvReaderDataset
}) {
function renderLoadDiagnostics(diagnostics) {
  const details = $("load-diagnostics");
  const content = $("load-diagnostics-content");
  if (!details || !content) return;

  content.textContent = "";
  if (!diagnostics || !Array.isArray(diagnostics.stages) || !diagnostics.stages.length) {
    details.hidden = true;
    return;
  }

  const labels = {
    general2025: "Mappatura generale 2025",
    pi1g2025: "Allegato A PI1G 2025",
    fixedSurvey2021: "Mappatura reti fisse 2021",
    proximity2025: "Civici di prossimità 2025",
    fiberCopProximity2025: "Civici di prossimità FiberCop 2025"
  };
  const formatTime = (milliseconds) => (Math.max(0, milliseconds) / 1000).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " s";
  const grouped = new Map();
  for (const stage of diagnostics.stages) {
    if (!grouped.has(stage.dataset)) grouped.set(stage.dataset, []);
    grouped.get(stage.dataset).push(stage);
  }

  const total = document.createElement("p");
  total.className = "load-diagnostics-total";
  total.textContent = "Round-trip Worker/UI: " + formatTime(diagnostics.roundTripMs ?? diagnostics.totalMs);
  content.appendChild(total);
  if (diagnostics.totalMs !== undefined && diagnostics.roundTripMs !== undefined) {
    const workerTotal = document.createElement("p");
    workerTotal.className = "load-diagnostics-total";
    workerTotal.textContent = "Elaborazione Worker: " + formatTime(diagnostics.totalMs);
    content.appendChild(workerTotal);
  }

  for (const [dataset, stages] of grouped) {
    const section = document.createElement("section");
    section.className = "load-diagnostics-group";
    const heading = document.createElement("strong");
    heading.textContent = labels[dataset] || dataset;
    section.appendChild(heading);

    const list = document.createElement("ul");
    for (const stage of stages) {
      const item = document.createElement("li");
      const time = stage.durationMs > 0 ? " · " + formatTime(stage.durationMs) : "";
      const detail = stage.source
        ? " · fonte: " + stage.source
        : stage.hit !== undefined
          ? (stage.hit ? " · cache hit" : " · cache miss")
          : stage.path
            ? " · " + stage.path
            : stage.entry
              ? " · " + stage.entry
              : stage.bytes !== undefined
                ? " · " + stage.bytes.toLocaleString("it-IT") + " byte"
                : stage.status !== undefined
                  ? " · HTTP " + stage.status
                  : "";
      item.textContent = stage.stage + time + detail;
      list.appendChild(item);
    }
    section.appendChild(list);
    content.appendChild(section);
  }
  details.hidden = false;
}

function setAutomaticStatus(region, pi1gAvailable, extraAvailable = state.extraAvailability) {
  const messages = [
    "Mappatura generale: " + state.generalCount.toLocaleString("it-IT") + " record",
    pi1gAvailable
      ? "Allegato A PI1G: " + state.pi1gCount.toLocaleString("it-IT") + " record"
      : "Allegato A PI1G: archivio regionale non disponibile"
  ];
  for (const key of EXTRA_DATASET_KEYS) {
    const count = state.extraCounts[key] || 0;
    if (state.manualExtras.has(key)) messages.push(DATASET_DEFINITIONS[key].label + ": file manuale · " + count.toLocaleString("it-IT") + " record");
    else if (state.checkedExtras.has(key)) messages.push(DATASET_DEFINITIONS[key].label + ": " + count.toLocaleString("it-IT") + " record disponibili per la Regione");
    else if (extraAvailable[key] === false) messages.push(DATASET_DEFINITIONS[key].label + ": archivio regionale non disponibile");
    else messages.push(DATASET_DEFINITIONS[key].label + ": non ancora caricato");
  }
  if (state.manualGeneral) messages[0] = "Mappatura generale: file manuale attivo · " + state.generalCount.toLocaleString("it-IT") + " record";
  if (state.manualPi1g) messages[1] = "Allegato A PI1G: file manuale attivo · " + state.pi1gCount.toLocaleString("it-IT") + " record";
  $("data-status").textContent = region + " · " + messages.join(" · ");
}


async function loadSelectedRegion() {
  const region = $("region").value.trim();
  const token = ++state.loadToken;
  state.searchToken += 1;
  state.readerLoadToken += 1;
  state.readerLoaded = false;
  state.readerPage = 0;
  state.checkedExtras.clear();
  renderLoadDiagnostics(null);
  void renderCsvReaderPage();
  $("results-card").hidden = true;
  $("search-error").textContent = "";

  if (region && !REGIONS.some((candidate) => normalise(candidate) === normalise(region))) {
    $("region-hint").textContent = "Seleziona una Regione valida dall'elenco dei suggerimenti.";
    $("data-status").textContent = "Regione non riconosciuta.";
    $("search-button").disabled = false;
    return;
  }
  if (!region) {
    state.loadedRegion = "";
    state.generalCount = state.manualGeneral ? state.generalCount : 0;
    state.pi1gCount = state.manualPi1g ? state.pi1gCount : 0;
    state.extraAvailability = {};
    for (const key of EXTRA_DATASET_KEYS) if (!state.manualExtras.has(key)) state.extraCounts[key] = 0;
    $("region-hint").textContent = "Seleziona una Regione per attivare i suggerimenti.";
    $("data-status").textContent = "Seleziona una Regione per caricare i dataset.";
    $("search-button").disabled = false;
    if (state.csvReaderMode) {
      $("csv-reader-dataset").disabled = false;
      $("csv-reader-page-size").disabled = false;
      $("csv-reader-status").textContent = "Seleziona una Regione per leggere il CSV.";
      void renderCsvReaderPage();
    }
    return;
  }
  if (state.loadedRegion === region) {
    setAutomaticStatus(region, state.pi1gAvailable, state.extraAvailability);
    if (state.csvReaderMode) await loadCsvReaderDataset();
    return;
  }

  $("region-hint").textContent = "Caricamento di tutti i dataset disponibili per suggerimenti e ricerca…";
  $("search-button").disabled = true;
  $("data-status").textContent = "Caricamento di tutti i dataset disponibili di " + region + "…";
  try {
    const automaticExtras = EXTRA_DATASET_KEYS.filter((key) => !state.manualExtras.has(key));
    const roundTripStartedAt = globalThis.performance?.now?.() ?? Date.now();
    const loaded = await loadRegionalData(region, {
      loadGeneral: !state.manualGeneral,
      loadPi1g: !state.manualPi1g,
      loadExtras: automaticExtras,
      collectTimings: true
    });
    if (loaded.timings) {
      loaded.timings.roundTripMs = (globalThis.performance?.now?.() ?? Date.now()) - roundTripStartedAt;
    }
    if (token !== state.loadToken) return;
    state.generalCount = loaded.counts.general;
    state.pi1gCount = loaded.counts.pi1g;
    state.extraCounts = loaded.counts.extra;
    state.pi1gAvailable = loaded.counts.pi1gAvailable;
    state.extraAvailability = loaded.counts.extraAvailable || {};
    for (const key of automaticExtras) state.checkedExtras.add(key);
    state.loadedRegion = region;
    setAutomaticStatus(region, state.pi1gAvailable, state.extraAvailability);
    renderLoadDiagnostics(loaded.timings);
    const errors = Object.entries(loaded.extraErrors || {});
    if (errors.length) {
      $("region-hint").textContent = region + " · caricamento parziale: alcuni archivi non hanno risposto. Usa «Cache Cleaner» per riprovare.";
      $("data-status").textContent += " · " + errors.map(([key, message]) => DATASET_DEFINITIONS[key].label + ": " + message).join(" · ");
    } else {
      $("region-hint").textContent = region + " · dataset caricati; suggerimenti e ricerca sono pronti.";
    }
    scheduleSuggestions("province");
  } catch (error) {
    if (token !== state.loadToken) return;
    state.loadedRegion = "";
    $("region-hint").textContent = "Caricamento non riuscito per " + region + ". Verifica lo stato dei dataset.";
    $("data-status").textContent = "Impossibile caricare tutti i dataset di " + region + ". " + (error.message || "Verifica i file o carica i dataset manualmente.");
  } finally {
    if (token === state.loadToken) {
      $("search-button").disabled = false;
      if (state.csvReaderMode) await loadCsvReaderDataset();
    }
  }
}

async function refreshAutomaticArchives() {
  const button = $("refresh-data-cache");
  const originalLabel = button.textContent;
  const region = $("region").value.trim();
  button.disabled = true;
  button.textContent = "Aggiornamento…";
  $("data-status").textContent = "Svuotamento della cache locale e aggiornamento degli archivi automatici…";
  try {
    await clearArchiveCache();
    state.loadedRegion = "";
    state.checkedExtras.clear();
    state.extraAvailability = {};
    if (region) {
      await loadSelectedRegion();
      $("data-status").textContent += " · Cache locale svuotata; archivi aggiornati.";
    } else {
      $("data-status").textContent = "Cache locale svuotata. Seleziona una Regione per scaricare nuovamente gli archivi.";
    }
  } catch (error) {
    $("data-status").textContent = error.message || "Impossibile aggiornare la cache degli archivi.";
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}


  return { setAutomaticStatus, loadSelectedRegion, refreshAutomaticArchives };
}
