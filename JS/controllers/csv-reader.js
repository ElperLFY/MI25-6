import { DATASET_DEFINITIONS, EXTRA_DATASET_KEYS } from "../data/index.js";

export function createCsvReaderController({
  $, state, createElement, getCsvReaderPage,
  loadCsvReaderDataset, releaseCsvReader
}) {
  const READER_DATASET_KEYS = new Set(["general2025", "pi1g2025", ...EXTRA_DATASET_KEYS]);

async function renderCsvReaderPage() {
  const token = ++state.readerPageToken;
  const head = $("csv-reader-head");
  const body = $("csv-reader-body");
  head.textContent = "";
  body.textContent = "";
  if (!state.readerLoaded) {
    $("csv-reader-page-info").textContent = "Nessuna riga da visualizzare";
    $("csv-reader-prev").disabled = true;
    $("csv-reader-next").disabled = true;
    return;
  }
  try {
    const result = await getCsvReaderPage({ page: state.readerPage, pageSize: state.readerPageSize, query: state.readerQuery });
    if (token !== state.readerPageToken || !state.csvReaderMode) return;
    state.readerPage = result.page;
    $("csv-reader-prev").disabled = result.filteredCount === 0 || result.page === 0;
    $("csv-reader-next").disabled = result.filteredCount === 0 || result.page >= result.totalPages - 1;
    if (!result.totalCount) { $("csv-reader-page-info").textContent = "Nessuna riga da visualizzare"; return; }
    if (!result.filteredCount) { $("csv-reader-page-info").textContent = "Nessuna riga corrisponde alla ricerca."; return; }
    if (!result.columns.length) { $("csv-reader-page-info").textContent = "Il file non contiene intestazioni leggibili."; return; }

    const headerRow = createElement("tr");
    for (const column of result.columns) {
      const cell = createElement("th", "", column.label);
      cell.scope = "col";
      headerRow.appendChild(cell);
    }
    headerRow.appendChild(createElement("th", "", "File sorgente"));
    head.appendChild(headerRow);

    const fragment = document.createDocumentFragment();
    for (const record of result.rows) {
      const row = createElement("tr");
      const names = Array.isArray(record.sourceHeaders) ? record.sourceHeaders : (record.sourceFields || []).map((field) => field.name);
      const rawValues = Array.isArray(record.sourceValues) ? record.sourceValues : (record.sourceFields || []).map((field) => field.value);
      const values = new Map();
      const occurrences = new Map();
      for (let index = 0; index < names.length; index += 1) {
        const label = String(names[index] ?? "").trim() || "Colonna senza nome";
        const occurrence = occurrences.get(label) || 0;
        occurrences.set(label, occurrence + 1);
        values.set(label + "\u0000" + occurrence, rawValues[index] ?? "");
      }
      for (const column of result.columns) row.appendChild(createElement("td", "", values.get(column.key) ?? ""));
      row.appendChild(createElement("td", "", record.sourceFile || ""));
      fragment.appendChild(row);
    }
    body.appendChild(fragment);
    const start = result.page * result.pageSize;
    const end = Math.min(start + result.rows.length, result.filteredCount);
    $("csv-reader-page-info").textContent =
      "Righe " + (start + 1).toLocaleString("it-IT") + "–" + end.toLocaleString("it-IT")
      + " di " + result.filteredCount.toLocaleString("it-IT")
      + (state.readerQuery ? " filtrate (totale archivio: " + result.totalCount.toLocaleString("it-IT") + ")" : "")
      + " · ordine originale dei CSV";
  } catch (error) {
    if (token === state.readerPageToken) $("csv-reader-page-info").textContent = error.message || "Impossibile aggiornare la tabella CSV.";
  }
}

async function loadCsvReaderDatasetUI() {
  const region = $("region").value.trim();
  const dataset = $("csv-reader-dataset").value;
  const token = ++state.readerLoadToken;
  state.readerLoaded = false;
  state.readerQuery = $("csv-reader-search").value.trim();
  state.readerPage = 0;
  await renderCsvReaderPage();
  if (!region) { $("csv-reader-status").textContent = "Seleziona una Regione prima di aprire il CSV Reader."; return; }
  if (!READER_DATASET_KEYS.has(dataset)) { $("csv-reader-status").textContent = "Dataset non riconosciuto."; return; }

  const label = DATASET_DEFINITIONS[dataset]?.label || "Dataset";
  $("csv-reader-status").textContent = "Lettura completa di " + label + " per " + region + " nel Web Worker…";
  $("csv-reader-dataset").disabled = true;
  $("csv-reader-page-size").disabled = true;
  try {
    const loaded = await loadCsvReaderDataset(region, dataset);
    if (token !== state.readerLoadToken || !state.csvReaderMode) return;
    if (loaded.error) { $("csv-reader-status").textContent = loaded.error; return; }
    if (!loaded.count) {
      $("csv-reader-status").textContent = loaded.available
        ? label + " · nessun record per " + region + "."
        : label + " · archivio regionale non disponibile per " + region + ".";
      return;
    }
    state.readerLoaded = true;
    $("csv-reader-status").textContent = label + " · " + region + " · " + loaded.count.toLocaleString("it-IT")
      + " righe complete. Filtraggio e paginazione sono eseguiti nel Web Worker.";
    await renderCsvReaderPage();
  } catch (error) {
    if (token !== state.readerLoadToken) return;
    $("csv-reader-status").textContent = error.message || "Impossibile leggere il CSV selezionato.";
  } finally {
    if (token === state.readerLoadToken) {
      $("csv-reader-dataset").disabled = false;
      $("csv-reader-page-size").disabled = false;
    }
  }
}

function setCsvReaderMode(enabled) {
  state.csvReaderMode = Boolean(enabled);
  $("csv-reader-toggle").textContent = state.csvReaderMode ? "CSV Reader ON" : "CSV Reader OFF";
  $("csv-reader-toggle").setAttribute("aria-pressed", String(state.csvReaderMode));
  $("csv-reader-card").hidden = !state.csvReaderMode;
  $("results-card").hidden = true;
  if (state.csvReaderMode) {
    $("mode-help").textContent = "CSV Reader ON: il Web Worker legge e filtra tutte le righe del dataset selezionato. La UI riceve soltanto la pagina corrente.";
    loadCsvReaderDataset();
  } else {
    state.readerLoadToken += 1;
    state.readerLoaded = false;
    state.readerPage = 0;
    void releaseCsvReader();
    $("csv-reader-status").textContent = "CSV Reader disattivato.";
    $("csv-reader-dataset").disabled = false;
    $("csv-reader-page-size").disabled = false;
    $("mode-help").textContent = "Ricerca indirizzo: tutti i dataset regionali disponibili vengono elaborati nel Web Worker; gli ZIP sono conservati in IndexedDB per 30 giorni. CSV Reader filtra e pagina i CSV nel Worker. Legacy mode consulta l'archivio storico Handymenny.";
    void renderCsvReaderPage();
  }
}


  return { renderCsvReaderPage, loadCsvReaderDataset: loadCsvReaderDatasetUI, setCsvReaderMode };
}
