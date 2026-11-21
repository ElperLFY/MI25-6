import { DATASET_DEFINITIONS, EXTRA_DATASET_KEYS, REGIONS, normalise } from "../data/index.js";

export function createRegionDataController({
  $, state, loadRegionalData, clearArchiveCache,
  scheduleSuggestions, renderCsvReaderPage, loadCsvReaderDataset
}) {
let diagnosticsAvailable = false;

function renderLoadDiagnostics(diagnostics) {
  const details = $("load-diagnostics");
  const content = $("load-diagnostics-content");
  if (!details || !content) return;

  content.textContent = "";
  if (!diagnostics || !Array.isArray(diagnostics.stages) || !diagnostics.stages.length) {
    diagnosticsAvailable = false;
    details.hidden = true;
    details.open = false;
    return;
  }

  const labels = {
    general2025: "Mappatura generale 2025",
    pi1g2025: "Allegato A PI1G 2025",
    fixedSurvey2021: "Mappatura reti fisse 2021",
    proximity2025: "Civici di prossimità 2025",
    privateProximity2025: "Civici di prossimità – consultazione 2025"
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
                  : stage.records !== undefined
                    ? " · " + stage.records.toLocaleString("it-IT") + " record indicizzati"
                    : stage.reason
                      ? " · " + stage.reason
                      : "";
      item.textContent = stage.stage + time + detail;
      list.appendChild(item);
    }
    section.appendChild(list);
    content.appendChild(section);
  }
  diagnosticsAvailable = true;
  details.hidden = !document.body.classList.contains("dev-mode-enabled");
}

function setDeveloperMode(enabled) {
  const active = Boolean(enabled);
  document.body.classList.toggle("dev-mode-enabled", active);
  const button = $("dev-mode-toggle");
  const details = $("load-diagnostics");
  if (button) {
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? "Disattiva modalità sviluppatore" : "Attiva modalità sviluppatore");
    button.title = active ? "Disattiva modalità sviluppatore" : "Attiva modalità sviluppatore";
  }
  if (details) {
    details.hidden = !(active && diagnosticsAvailable);
    if (!active) details.open = false;
  }
}

function syncDeferredDatasetControl() {
  const button = $("load-2021-dataset");
  const status = $("load-2021-dataset-status");
  if (!button || !status) return;

  const region = $("region").value.trim();
  if (state.manualExtras.has("fixedSurvey2021")) {
    button.disabled = true;
    button.textContent = "Mappatura 2021 manuale attiva";
    status.textContent = "Hai già caricato un tuo file per la mappatura 2021.";
  } else if (state.checkedExtras.has("fixedSurvey2021") && state.extraAvailability.fixedSurvey2021 === false) {
    button.disabled = true;
    button.textContent = "Archivio 2021 non disponibile";
    status.textContent = "Il pacchetto MI25-6 non contiene il file 2021 per questa Regione.";
  } else if (state.checkedExtras.has("fixedSurvey2021")) {
    button.disabled = true;
    button.textContent = "Mappatura 2021 caricata";
    status.textContent = "La mappatura 2021 è già stata aggiunta alla ricerca.";
  } else if (!region) {
    button.disabled = true;
    button.textContent = "Carica mappatura 2021";
    button.title = "Seleziona prima una Regione";
    status.textContent = "Scegli una Regione per abilitare il caricamento.";
  } else if (state.loadedRegion !== region) {
    button.disabled = true;
    button.textContent = "Carica mappatura 2021";
    button.title = "Attendi il caricamento dei dataset principali";
    status.textContent = "Sto preparando i dati della Regione: la mappatura 2021 sarà disponibile tra poco.";
  } else {
    button.disabled = false;
    button.title = "Carica la mappatura storica 2021 per la Regione selezionata";
    button.textContent = "Carica mappatura 2021";
    status.textContent = "Archivio opzionale: caricalo soltanto quando ti serve.";
  }
}

// Deliberately accepts no dataset key: this loader is bound to the 2021 button.
// It also safely ignores any MouseEvent passed by a legacy direct listener.
async function loadAdditionalDataset() {
  const key = "fixedSurvey2021";
  const region = $("region").value.trim();
  if (!region || state.loadedRegion !== region) {
    $("load-2021-dataset-status").textContent = "Scegli una Regione e attendi che la ricerca sia pronta."
    return;
  }
  if (state.manualExtras.has(key) || state.checkedExtras.has(key)) {
    syncDeferredDatasetControl();
    return;
  }

  const button = $("load-2021-dataset");
  const status = $("load-2021-dataset-status");
  const token = state.loadToken;
  button.disabled = true;
  button.textContent = "Caricamento 2021…";
  status.textContent = "Sto scaricando e preparando la mappatura 2021 di " + region + "…";

  try {
    const loaded = await loadRegionalData(region, {
      loadGeneral: false,
      loadPi1g: false,
      loadExtras: [key],
      collectTimings: true
    });
    if (token !== state.loadToken || $("region").value.trim() !== region) return;

    state.extraCounts[key] = loaded.counts.extra[key] || 0;
    state.extraAvailability[key] = loaded.counts.extraAvailable[key] === true;
    if (!loaded.extraErrors?.[key]) state.checkedExtras.add(key);

    setAutomaticStatus(region, state.pi1gAvailable, state.extraAvailability);
    renderLoadDiagnostics(loaded.timings);
    if (loaded.extraErrors?.[key]) {
      status.textContent = DATASET_DEFINITIONS[key].label + " · errore: " + loaded.extraErrors[key] + ". Puoi riprovare.";
      state.checkedExtras.delete(key);
    } else if (!state.extraAvailability[key] || state.extraCounts[key] === 0) {
      status.textContent = "Non ci sono dati 2021 disponibili in MI25-6 per " + region + ". Consulta le FAQ per i dettagli."
    } else {
      status.textContent = DATASET_DEFINITIONS[key].label + " · " + state.extraCounts[key].toLocaleString("it-IT") + " record aggiunti alla ricerca.";
    }
    syncDeferredDatasetControl();
    if (loaded.timings) {
      const note = document.createElement("div");
      note.className = "file-entry";
      note.textContent = "Mappatura 2021 aggiunta alla ricerca.";
      $("data-status").appendChild(note);
    }
  } catch (error) {
    if (token !== state.loadToken) return;
    status.textContent = error.message || "Impossibile caricare la mappatura 2021.";
  } finally {
    syncDeferredDatasetControl();
  }
}

function setAutomaticStatus(region, pi1gAvailable, extraAvailable = state.extraAvailability) {
  const container = $("data-status");
  container.textContent = "";

  const heading = document.createElement("div");
  heading.className = "data-status-heading";
  heading.textContent = "Dati pronti per " + region;
  container.appendChild(heading);

  const addLine = (message) => {
    const line = document.createElement("div");
    line.className = "file-entry";
    line.textContent = message;
    container.appendChild(line);
  };
  const count = (value) => Number(value || 0).toLocaleString("it-IT");

  addLine("Mappatura generale 2025 · " + count(state.generalCount) + " civici"
    + (state.manualGeneral ? " · file caricato da te" : ""));

  if (state.manualPi1g) {
    addLine("Allegato A PI1G · " + count(state.pi1gCount) + " civici · file caricato da te");
  } else if (pi1gAvailable && state.pi1gCount) {
    addLine("Allegato A PI1G · " + count(state.pi1gCount) + " civici");
  } else if (pi1gAvailable) {
    addLine("Allegato A PI1G · nessun civico pubblicato per questa Regione");
  } else {
    addLine("Allegato A PI1G · archivio non disponibile per questa Regione");
  }

  for (const key of EXTRA_DATASET_KEYS) {
    const label = DATASET_DEFINITIONS[key].label;
    const records = state.extraCounts[key] || 0;
    if (state.manualExtras.has(key)) {
      addLine(label + " · " + count(records) + " record · file caricato da te");
    } else if (extraAvailable[key] === false) {
      addLine(label + " · archivio non disponibile per questa Regione");
    } else if (state.checkedExtras.has(key)) {
      addLine(label + " · " + count(records) + " record");
    } else if (key === "fixedSurvey2021") {
      addLine(label + " · disponibile su richiesta");
    } else {
      addLine(label + " · non ancora caricato");
    }
  }
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
    syncDeferredDatasetControl();
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
    syncDeferredDatasetControl();
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
    syncDeferredDatasetControl();
    if (state.csvReaderMode) await loadCsvReaderDataset();
    return;
  }

  syncDeferredDatasetControl();
  $("region-hint").textContent = "Sto preparando suggerimenti e ricerca…";
  $("search-button").disabled = true;
  $("data-status").textContent = "Sto caricando i dati di " + region + "…";
  try {
    const automaticExtras = EXTRA_DATASET_KEYS.filter((key) =>
      key !== "fixedSurvey2021" && !state.manualExtras.has(key)
    );
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
      $("region-hint").textContent = region + " · alcuni archivi non sono disponibili. Puoi riprovare con «Aggiorna archivi».";
      const warning = document.createElement("div");
      warning.className = "file-entry";
      warning.textContent = "Alcuni dati non sono stati caricati: " + errors.map(([key, message]) => DATASET_DEFINITIONS[key].label + " — " + message).join(" · ");
      $("data-status").appendChild(warning);
    } else {
      $("region-hint").textContent = region + " · dataset caricati; suggerimenti e ricerca sono pronti.";
    }
    scheduleSuggestions("province");
    syncDeferredDatasetControl();
  } catch (error) {
    if (token !== state.loadToken) return;
    state.loadedRegion = "";
    $("region-hint").textContent = "Non sono riuscito a preparare i dati di " + region + ". Verifica lo stato dei dataset.";
    syncDeferredDatasetControl();
    $("data-status").textContent = "Non è stato possibile caricare i dati di " + region + ". " + (error.message || "Controlla i file o riprova.");
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
  $("data-status").textContent = "Rimuovo le copie locali e aggiorno i dati automatici…";

  try {
    const cacheResult = await clearArchiveCache();
    if (cacheResult?.persistentAvailable && !cacheResult.persistentCleared) {
      throw new Error("La cache in IndexedDB non è stata cancellata. L'aggiornamento è stato interrotto per evitare di riutilizzare archivi precedenti; i dataset già caricati restano disponibili.");
    }

    state.loadedRegion = "";
    state.checkedExtras.clear();
    state.extraAvailability = {};
    const cacheMessage = cacheResult?.persistentCleared
      ? "Le copie locali dei dati MI25-6 sono state rimosse."
      : "Copie temporanee rimosse; il browser non aveva copie salvate da cancellare.";

    if (region) {
      await loadSelectedRegion();
      if (state.loadedRegion === region) {
        $("data-status").textContent += " · " + cacheMessage + " Dataset automatici ricaricati.";
      } else {
        $("data-status").textContent += " · " + cacheMessage + " Il ricaricamento dei dataset non è riuscito.";
      }
    } else {
      $("data-status").textContent = cacheMessage + " Seleziona una Regione per scaricare nuovamente i dataset automatici.";
    }
  } catch (error) {
    $("data-status").textContent = error.message || "Impossibile aggiornare gli archivi MI25-6.";
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}



  return {
    setAutomaticStatus,
    setDeveloperMode,
    loadSelectedRegion,
    loadAdditionalDataset,
    syncDeferredDatasetControl,
    refreshAutomaticArchives
  };
}
