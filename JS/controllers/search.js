import { DATASET_DEFINITIONS, EXTRA_DATASET_KEYS, normalise } from "../data/index.js";

export function createSearchController({
  $, state, searchRecords, cityIsKnown, parseUploadedFiles, clearManualDatasets,
  renderResults, setAutomaticStatus, setFileMessages, scheduleSuggestions, loadSelectedRegion, loadCsvReaderDataset
}) {
function hasRecords() {
  if (state.generalCount || state.pi1gCount) return true;
  return EXTRA_DATASET_KEYS.some((key) => state.extraCounts[key] > 0);
}

async function runSearch(event) {
  event.preventDefault();
  const query = {
    region: normalise($("region").value),
    province: normalise($("province").value),
    city: normalise($("city").value),
    street: normalise($("street").value),
    number: normalise($("street-number").value)
  };
  const token = ++state.searchToken;
  $("results-list").textContent = "";
  $("search-error").textContent = "";
  if (!$("region").value && !state.manualGeneral && !state.manualPi1g && !state.manualExtras.size) {
    $("search-error").textContent = "Seleziona una Regione.";
    return;
  }
  if (!hasRecords()) {
    $("search-error").textContent = "Seleziona una Regione oppure carica un file manualmente.";
    return;
  }
  if (!query.city || !query.street) {
    $("search-error").textContent = "Inserisci almeno Comune e Via. Il civico resta facoltativo.";
    return;
  }

  $("search-button").disabled = true;
  $("data-status").textContent = "Ricerca indirizzo nel Web Worker…";
  try {
    const results = await searchRecords(query);
    if (token !== state.searchToken) return;
    const knownCity = results.length ? true : await cityIsKnown($("city").value, $("region").value);
    if (token !== state.searchToken) return;
    renderResults(results, {
      city: $("city").value, province: $("province").value,
      street: $("street").value, number: $("street-number").value
    }, knownCity);
    if ($("region").value && state.loadedRegion) setAutomaticStatus($("region").value, state.pi1gAvailable, state.extraAvailability);
    else if (state.manualGeneral || state.manualPi1g || state.manualExtras.size) $("data-status").textContent = "Ricerca completata sui dataset manuali.";
  } catch (error) {
    if (token !== state.searchToken) return;
    $("search-error").textContent = error.message || "Errore durante la ricerca dei dataset.";
  } finally {
    if (token === state.searchToken) $("search-button").disabled = false;
  }
}

function clearSearch() {
  ["region", "province", "city", "street", "street-number"].forEach((id) => { $(id).value = ""; });
  ["province-options", "city-options", "street-options", "number-options"].forEach((id) => { $(id).textContent = ""; });
  for (const field of ["region", "province", "city", "street", "number"]) {
    const hint = $(field + "-hint");
    if (hint) hint.textContent = "";
  }
  for (const field of Object.keys(suggestionValues)) suggestionValues[field] = [];
  $("search-error").textContent = "";
  $("results-card").hidden = true;
  loadSelectedRegion();
}

async function handleFileUpload(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  setFileMessages(["Invio dei file al Web Worker per la lettura…"]);
  try {
    const imported = await parseUploadedFiles(files, { includeSourceFields: state.csvReaderMode });
    const importedCount = Object.values(imported.counts || {}).reduce((total, count) => total + count, 0);
    const counts = imported.summary;
    state.generalCount = counts.general;
    state.pi1gCount = counts.pi1g;
    state.extraCounts = counts.extra;
    state.pi1gAvailable = counts.pi1gAvailable;
    if (imported.counts.general2025) state.manualGeneral = true;
    if (imported.counts.pi1g2025) state.manualPi1g = true;
    for (const key of EXTRA_DATASET_KEYS) if (imported.counts[key]) state.manualExtras.add(key);
    setFileMessages(imported.messages.length ? imported.messages : ["Nessun dataset riconosciuto nei file selezionati."]);
    if (importedCount) {
      const summary = ["Mappatura generale " + state.generalCount.toLocaleString("it-IT"), "PI1G " + state.pi1gCount.toLocaleString("it-IT")];
      for (const key of EXTRA_DATASET_KEYS) if (state.extraCounts[key]) summary.push(DATASET_DEFINITIONS[key].label + " " + state.extraCounts[key].toLocaleString("it-IT"));
      $("data-status").textContent = "Dataset manuali elaborati nel Worker · " + summary.join(" · ");
      $("results-card").hidden = true;
      for (const field of ["province", "city", "street", "number"]) scheduleSuggestions(field);
    }
    if (state.csvReaderMode) await loadCsvReaderDataset();
  } catch (error) {
    setFileMessages([error.message || "Impossibile elaborare i file selezionati nel Web Worker."]);
  } finally {
    event.target.value = "";
  }
}

async function restoreAutomaticData() {
  try {
    const counts = await clearManualDatasets();
    state.manualGeneral = false;
    state.manualPi1g = false;
    state.manualExtras.clear();
    state.generalCount = counts.general;
    state.pi1gCount = counts.pi1g;
    state.extraCounts = counts.extra;
    state.loadedRegion = "";
    setFileMessages(["Nessun file manuale attivo."]);
    await loadSelectedRegion();
  } catch (error) {
    $("data-status").textContent = error.message || "Impossibile ripristinare i dataset automatici.";
  }
}


  return { runSearch, clearSearch, handleFileUpload, restoreAutomaticData };
}
