import {
  DATASET_DEFINITIONS, DOTS, EXTRA_DATASET_KEYS,
  decodeFixedSurvey2021Color, decodeFixedSurvey2021Speed, REGIONS, normalise
} from "./data/index.js";
import {
  cityIsKnown, clearArchiveCache, clearManualDatasets, findCityRecord,
  getCsvReaderPage, getSuggestions, loadCsvReaderDataset as requestCsvReaderDataset,
  loadRegionalData, parseUploadedFiles, releaseCsvReader, searchRecords
} from "./services/data-client.js";
import {
  LegacyClient,
  legacyReport,
  legacySections,
  legacyText
} from "./legacy.js";

const $ = (id) => document.getElementById(id);
const legacyClient = new LegacyClient();

const state = {
  generalCount: 0,
  pi1gCount: 0,
  extraCounts: Object.fromEntries(EXTRA_DATASET_KEYS.map((key) => [key, 0])),
  manualGeneral: false,
  manualPi1g: false,
  manualExtras: new Set(),
  loadToken: 0,
  searchToken: 0,
  loadedRegion: "",
  readerQuery: "",
  pi1gAvailable: false,
  extraAvailability: {},
  checkedExtras: new Set(),
  legacyMode: false,
  csvReaderMode: false,
  readerLoaded: false,
  readerPage: 0,
  readerPageSize: 100,
  readerLoadToken: 0,
  readerPageToken: 0
};

};

const legacyState = {
  region: "",
  province: "",
  city: "",
  street: "",
  number: "",
  egon: ""
};

const legacyLists = {
  regions: [],
  provinces: [],
  cities: [],
  streets: [],
  numbers: []
};

const legacyTokens = {
  provinces: 0,
  cities: 0,
  streets: 0,
  numbers: 0,
  record: 0
};

const legacyNumberItems = [];
const suggestionTimers = {};
let readerSearchTimer = null;
const suggestionValues = { province: [], city: [], street: [], number: [] };

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

function addLine(container, label, value) {
  const row = createElement("div", "result-line");
  row.appendChild(createElement("span", "result-label", label));
  if (value instanceof Node) {
    row.appendChild(value);
  } else {
    row.appendChild(document.createTextNode(" " + String(value)));
  }
  container.appendChild(row);
}

function addCompareValue(container, label, value) {
  const row = createElement("div", "compare-row");
  row.appendChild(createElement("span", "compare-label", label + ": "));
  row.appendChild(document.createTextNode(String(value)));
  container.appendChild(row);
}

function formatAddress(record) {
  const noNumber = !normalise(record.number) || normalise(record.number) === "0";
  const number = record.fullAddress && record.street === record.fullAddress
    ? ""
    : noNumber
      ? (normalise(record.suffix) === "SNC" || normalise(record.number) === "0" ? "SNC" : "")
      : [record.number, record.suffix].filter(Boolean).join("/");
  return [
    record.street || record.fullAddress,
    number,
    record.district ? record.district + ", " + record.city : record.city,
    record.province ? "(" + record.province + ")" : "",
    record.region
  ].filter(Boolean).join(" ");
}

function getPrimaryRecord(result) {
  if (result.general || result.pi1g) return result.general || result.pi1g;
  for (const key of EXTRA_DATASET_KEYS) {
    const record = result.datasets[key]?.[0];
    if (record) return record;
  }
  return null;
}

function getPrimaryExtraKey(result) {
  if (result.general || result.pi1g) return "";
  return EXTRA_DATASET_KEYS.find((key) => (result.datasets[key] || []).length > 0) || "";
}

function getPrimaryDatasetLabel(result) {
  if (result.general) return DATASET_DEFINITIONS.general2025.label;
  if (result.pi1g) return DATASET_DEFINITIONS.pi1g2025.label;
  const key = getPrimaryExtraKey(result);
  return key ? DATASET_DEFINITIONS[key].label : "Indirizzo";
}

function getGeneralAbsenceMessage() {
  if (state.generalCount || state.manualGeneral) {
    return "Nessuna corrispondenza nel sottoinsieme degli esiti pubblicati 2025; questo dato, da solo, non dimostra assenza di copertura.";
  }
  return "Dataset della mappatura generale 2025 non disponibile per questa ricerca.";
}

function hasRecords() {
  if (state.generalCount || state.pi1gCount) return true;
  return EXTRA_DATASET_KEYS.some((key) => state.extraCounts[key] > 0);
}


function populateRegions() {
  for (const region of REGIONS) {
    const option = createElement("option", "", region);
    option.value = region;
    $("region-options").appendChild(option);
  }
}

function updateRegionHint() {
  const typed = $("region").value.trim();
  const hint = $("region-hint");
  if (!typed) {
    hint.textContent = "Digita le iniziali della Regione e premi Invio per selezionarla.";
    return;
  }

  const query = normalise(typed);
  const matches = REGIONS.filter((region) => normalise(region).startsWith(query));
  hint.textContent = matches.length
    ? matches.slice(0, 4).join(" · ") + (matches.length > 4 ? " · …" : "") + " · premi Invio per selezionare."
    : "Nessuna Regione corrispondente. Scegli una voce valida dall'elenco.";
}

function handleRegionEnter(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();

  const typed = normalise($("region").value);
  if (!typed) {
    updateRegionHint();
    return;
  }
  const selected = REGIONS.find((region) => normalise(region) === typed)
    || REGIONS.find((region) => normalise(region).startsWith(typed));
  if (!selected) {
    updateRegionHint();
    return;
  }

  const changed = $("region").value !== selected;
  $("region").value = selected;
  $("region-hint").textContent = selected + " · Regione selezionata.";
  if (changed || state.loadedRegion !== selected) loadSelectedRegion();
  $("province").focus();
}

function renderLegend() {
  const legend = $("legend-list");
  legend.textContent = "";

  for (const [code, details] of Object.entries(DOTS)) {
    const row = createElement("div", "legend-entry");
    const dot = createElement("span", "dot");
    dot.style.borderColor = details[0];
    row.appendChild(dot);
    row.appendChild(createElement("span", "legend-code", code + ": "));
    row.appendChild(document.createTextNode(details[1]));
    legend.appendChild(row);
  }
}

function renderOptions(listId, values, showEgon = false) {
  const list = $(listId);
  list.textContent = "";

  for (const value of values) {
    const option = createElement("option");
    option.value = showEgon ? String(value.number) : String(value);
    if (showEgon) option.label = "ID EGON: " + value.egon;
    list.appendChild(option);
  }
}

function currentSearchState() {
  return {
    region: $("region").value,
    province: $("province").value,
    city: $("city").value,
    street: $("street").value,
    number: $("street-number").value
  };
}

function setFileMessages(messages) {
  const list = $("file-list");
  list.textContent = "";
  if (!messages.length) {
    list.textContent = "Nessun file caricato.";
    return;
  }
  for (const message of messages) list.appendChild(createElement("div", "file-entry", message));
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
    const loaded = await loadRegionalData(region, {
      loadGeneral: !state.manualGeneral,
      loadPi1g: !state.manualPi1g,
      loadExtras: automaticExtras
    });
    if (token !== state.loadToken) return;
    state.generalCount = loaded.counts.general;
    state.pi1gCount = loaded.counts.pi1g;
    state.extraCounts = loaded.counts.extra;
    state.pi1gAvailable = loaded.counts.pi1gAvailable;
    state.extraAvailability = loaded.counts.extraAvailable || {};
    for (const key of automaticExtras) state.checkedExtras.add(key);
    state.loadedRegion = region;
    setAutomaticStatus(region, state.pi1gAvailable, state.extraAvailability);
    const errors = Object.entries(loaded.extraErrors || {});
    if (errors.length) {
      $("data-status").textContent += " · " + errors.map(([key, message]) => DATASET_DEFINITIONS[key].label + ": " + message).join(" · ");
    }
    scheduleSuggestions("province");
  } catch (error) {
    if (token !== state.loadToken) return;
    state.loadedRegion = "";
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


function updateFieldHint(field, inputValue, values) {
  const hint = $(field + "-hint");
  if (!hint) return;
  const typed = String(inputValue || "").trim();

  if (!typed && field !== "number") {
    hint.textContent = "";
    return;
  }
  if (!typed && field === "number") {
    if (!$("street").value.trim()) {
      hint.textContent = "";
      return;
    }
    hint.textContent = values.length
      ? "Civico facoltativo · " + values.length.toLocaleString("it-IT") + " opzioni disponibili."
      : "Inserisci il civico oppure lascia il campo vuoto.";
    return;
  }

  if (values.length) {
    const count = values.length > 40 ? "40+" : values.length.toLocaleString("it-IT");
    hint.textContent = count + " suggerimenti · premi Invio per selezionare il primo.";
  } else {
    hint.textContent = "Nessun suggerimento corrispondente · puoi comunque inserire il valore manualmente.";
  }
}

const suggestionRequestTokens = { province: 0, city: 0, street: 0, number: 0 };

async function updateSuggestions(field, token = suggestionRequestTokens[field]) {
  const mapping = {
    province: ["province", "province-options"],
    city: ["city", "city-options"],
    street: ["street", "street-options"],
    number: ["street-number", "number-options"]
  };
  const [inputId, listId] = mapping[field];
  const input = $(inputId);
  const typed = input.value;
  const values = await getSuggestions(field, typed, currentSearchState());
  if (token !== suggestionRequestTokens[field] || input.value !== typed) return;
  suggestionValues[field] = values.slice(0, 40);
  renderOptions(listId, suggestionValues[field]);
  updateFieldHint(field, typed, values);
}

function scheduleSuggestions(field) {
  suggestionRequestTokens[field] += 1;
  const token = suggestionRequestTokens[field];
  window.clearTimeout(suggestionTimers[field]);
  suggestionTimers[field] = window.setTimeout(() => {
    updateSuggestions(field, token).catch((error) => {
      if (token === suggestionRequestTokens[field]) $(field + "-hint").textContent = error.message || "Suggerimenti temporaneamente non disponibili.";
    });
  }, 120);
}

async function handleAutocompleteEnter(field, event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const inputId = field === "number" ? "street-number" : field;
  const input = $(inputId);
  const typed = input.value.trim();
  if (!typed && field !== "number") return;

  try {
    const values = typed ? (await getSuggestions(field, typed, currentSearchState())).slice(0, 40) : (suggestionValues[field] || []);
    suggestionValues[field] = values;
    const normalized = normalise(typed);
    const selected = normalized
      ? values.find((value) => normalise(value) === normalized)
        || values.find((value) => normalise(value).startsWith(normalized))
        || (values.length === 1 ? values[0] : null)
      : null;
    if (selected) input.value = selected;
    if (field === "city") {
      const record = await findCityRecord(input.value);
      if (record && !$("province").value) $("province").value = record.province;
    }
    if (field === "number") {
      $("search-form").requestSubmit();
      return;
    }
    const next = ({ province: "city", city: "street", street: "number" })[field];
    if (!next) return;
    const nextInput = next === "number" ? $("street-number") : $(next);
    scheduleSuggestions(next);
    nextInput.focus();
  } catch (error) {
    $("data-status").textContent = error.message || "Impossibile recuperare i suggerimenti.";
  }
}


function makeDot(code) {
  const dot = createElement("span", "dot");
  dot.style.borderColor = (DOTS[code] || ["#999999"])[0];
  return dot;
}

function getDatasetDisplayRows(key, record) {
  const rows = [];
  const add = (label, value) => {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      rows.push({ label, value: String(value) });
    }
  };

  if (key === "proximity2025") {
    add("Copertura privata dichiarata nella mappatura 2024", record.openFiberDeclared2024);
    add("Coperto a giugno 2025", record.coveredJune2025);
    add("Ammissibile", record.eligibility);
    add("Cause di esclusione", record.exclusionReason);
  }

  if (key === "fiberCopProximity2025") {
    add("Ammissibile", record.eligibility);
    add("Cause di esclusione", record.exclusionReason);
  }

  if (key === "fixedSurvey2021") {
    add("Colore civico 2026", decodeFixedSurvey2021Color(record.networkColor2026, record.networkColor2026Present));
    add("Velocità massima download 2026", decodeFixedSurvey2021Speed(record.maxDownload2026, record.networkColor2026Present));
    add("Velocità di picco download 2026", decodeFixedSurvey2021Speed(record.peakDownload2026, record.networkColor2026Present));
    add("Operatore", record.operator);
    add("NGA", record.nga);
    add("Tecnologia", record.technology);
    add("Velocità massima download", record.maxDownload);
    add("Velocità massima upload", record.maxUpload);
    add("Velocità di picco download", record.peakDownload);
    add("Velocità di picco upload", record.peakUpload);
    add("Anno di copertura", record.coverageYear);
  }

  add("Codice Comune", record.procom || record.municipalityCode);
  add("Chilometrica", record.km);
  add("Coordinate", record.latitude && record.longitude ? record.latitude + ", " + record.longitude : "");
  return rows;
}

function collectReportLines(result) {
  const lines = [];
  for (const key of EXTRA_DATASET_KEYS) {
    const records = result.datasets[key] || [];
    for (const record of records) {
      lines.push(DATASET_DEFINITIONS[key].label);
      for (const row of getDatasetDisplayRows(key, record)) lines.push(row.label + ": " + row.value);
    }
  }
  return lines;
}

function modernReport(result, address) {
  const lines = [
    "MI25-6 · Esito: " + getPrimaryDatasetLabel(result),
    "Indirizzo: " + address,
    "ID EGON: " + (result.id || "Non disponibile")
  ];

  if (result.general) {
    const code = result.general.characteristic;
    lines.push("Caratteristica: " + (code || "ND") + (DOTS[code] ? " — " + DOTS[code][1] : " — non disponibile nel CSV"));
    lines.push("Fonte: Infratel 2025 · aggiornamento febbraio 2026.");
  }

  if (result.pi1g) {
    lines.push("Allegato A PI1G 2025: presente.");
    lines.push("Fonte: Infratel · 16/02/2026.");
  }

  const primaryExtraKey = getPrimaryExtraKey(result);
  for (const key of EXTRA_DATASET_KEYS) {
    const records = result.datasets[key] || [];
    for (const record of records) {
      lines.push("");
      if (key !== primaryExtraKey) lines.push(DATASET_DEFINITIONS[key].label);
      for (const row of getDatasetDisplayRows(key, record)) {
        lines.push(row.label + ": " + row.value);
      }
    }
  }
  if (!result.general) {
    lines.push("");
    lines.push("Mappatura reti fisse 2025: " + getGeneralAbsenceMessage());
  }
  lines.push("");
  lines.push("Nota: le velocità sono classi/soglie del dataset, non misurazioni istantanee né garanzie della velocità effettiva. I dati non certificano la vendibilità commerciale o la copertura attuale.");
  return lines.join("\n");
}

async function copyText(text, button, successLabel) {
  const originalLabel = button.textContent;
  let copied = false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    } else {
      const field = createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.className = "copy-fallback";
      document.body.appendChild(field);
      field.select();
      copied = document.execCommand("copy");
      field.remove();
    }
  } catch {
    copied = false;
  }

  button.textContent = copied ? successLabel : "Copia non riuscita";
  button.disabled = true;
  window.setTimeout(() => {
    button.textContent = originalLabel;
    button.disabled = false;
  }, 1500);
}

function renderLegacySections(container, data) {
  for (const sectionData of legacySections(data)) {
    const section = createElement("section", "legacy-section");
    section.appendChild(createElement("h4", "", sectionData.title));

    for (const rowData of sectionData.rows) {
      const row = createElement("div", "legacy-row");
      row.appendChild(createElement("span", "legacy-label", rowData.label + ": "));
      row.appendChild(document.createTextNode(rowData.value));
      section.appendChild(row);
    }

    container.appendChild(section);
  }
}

function renderHistoryComparison(panel, result, address, data) {
  panel.textContent = "";
  panel.hidden = false;
  panel.appendChild(createElement("h4", "", "Confronto storico · stesso ID EGON"));
  const grid = createElement("div", "compare-grid");
  const current = createElement("section", "compare-column");
  const historic = createElement("section", "compare-column");

  current.appendChild(createElement("h5", "", "MI25-6 · 2025-26"));
  addCompareValue(current, "Indirizzo", address);
  addCompareValue(current, "ID EGON", result.id || "Non disponibile");
  addCompareValue(current, "Mappatura generale", result.general
    ? "Presente nell’elenco degli esiti 2025"
    : "Nessuna corrispondenza nell’elenco caricato");
  if (result.general) {
    const code = result.general.characteristic;
    addCompareValue(current, "Caratteristica", code && DOTS[code] ? code + " — " + DOTS[code][1] : "Non disponibile nel CSV");
    addCompareValue(current, "Fonte", "Infratel 2025 · aggiornamento 26/02/2026");
  }
  addCompareValue(current, "Allegato A PI1G", result.pi1g ? "Presente negli esiti 2025" : "Nessuna corrispondenza nell’elenco caricato");
  if (result.pi1g) addCompareValue(current, "Fonte PI1G", "Infratel · 16/02/2026");
  for (const line of collectReportLines(result)) addCompareValue(current, "Altri dataset", line);

  historic.appendChild(createElement("h5", "", "Legacy · 2017-2021"));
  for (const section of legacySections(data)) {
    for (const row of section.rows) addCompareValue(historic, section.title + " · " + row.label, row.value);
  }

  grid.appendChild(current);
  grid.appendChild(historic);
  panel.appendChild(grid);
  panel.appendChild(createElement("p", "compare-note", "Le colonne descrivono fonti e consultazioni di anni diversi. Le differenze non dimostrano da sole un aggiornamento della copertura commerciale o un cambiamento fisico della rete."));

  const actions = createElement("div", "result-actions");
  const copy = createElement("button", "button button-small button-secondary", "Copia confronto");
  copy.type = "button";
  copy.addEventListener("click", () => copyText(modernReport(result, address) + "\n\n" + legacyReport(data, address), copy, "Confronto copiato!"));
  actions.appendChild(copy);
  panel.appendChild(actions);
}

function attachResultActions(item, result, address) {
  const actions = createElement("div", "result-actions");
  const copy = createElement("button", "button button-small button-secondary", "Copia risultato");
  copy.type = "button";
  copy.addEventListener("click", () => copyText(modernReport(result, address), copy, "Risultato copiato!"));
  actions.appendChild(copy);

  if (result.id) {
    const compare = createElement("button", "button button-small button-secondary", "Confronta con Legacy");
    compare.type = "button";
    const panel = createElement("div", "compare-panel");
    panel.hidden = true;

    compare.addEventListener("click", async () => {
      if (!panel.hidden) {
        panel.hidden = true;
        compare.textContent = "Confronta con Legacy";
        return;
      }

      panel.hidden = false;
      panel.textContent = "Recupero dei dati storici da Handymenny…";
      compare.disabled = true;

      try {
        const historical = await legacyClient.getRecord(result.id);
        if (!historical || typeof historical !== "object") throw new Error("Risposta storica non valida.");
        if (historical.egon !== undefined && String(historical.egon) !== String(result.id)) {
          throw new Error("L’API ha restituito un ID EGON diverso da quello richiesto.");
        }
        renderHistoryComparison(panel, result, address, historical);
        compare.textContent = "Nascondi confronto";
      } catch (error) {
        panel.textContent = error.message || "Impossibile recuperare il record storico.";
        compare.textContent = "Riprova confronto Legacy";
      } finally {
        compare.disabled = false;
      }
    });

    actions.appendChild(compare);
    item.appendChild(actions);
    item.appendChild(panel);
    return;
  }

  item.appendChild(actions);
}

function renderExtraDatasets(item, result, primaryKey = "") {
  for (const key of EXTRA_DATASET_KEYS) {
    const records = result.datasets[key] || [];
    if (!records.length) continue;

    const section = createElement("section", "legacy-section");
    if (key !== primaryKey) {
      section.appendChild(createElement("h4", "", DATASET_DEFINITIONS[key].label));
    }

    for (const record of records) {
      const standardRows = getDatasetDisplayRows(key, record);
      for (const rowData of standardRows) {
        const row = createElement("div", "legacy-row");
        row.appendChild(createElement("span", "legacy-label", rowData.label + ": "));
        row.appendChild(document.createTextNode(rowData.value));
        section.appendChild(row);
      }

      const details = createElement("details", "dataset-raw-fields");
      details.appendChild(createElement("summary", "", "Altri campi del file"));
      for (const field of record.extraFields || []) {
        const row = createElement("div", "legacy-row");
        row.appendChild(createElement("span", "legacy-label", field.name + ": "));
        row.appendChild(document.createTextNode(field.value));
        details.appendChild(row);
      }
      if (record.extraFields?.length) section.appendChild(details);
    }

    item.appendChild(section);
  }
}

function renderResults(results, query, knownCity = false) {
  const container = $("results-list");
  container.textContent = "";

  if (!results.length) {
    const item = createElement("div", "result-item");
    if (!knownCity) {
      item.appendChild(createElement("h3", "item-title", "Comune non presente nei file caricati"));
      item.appendChild(createElement("p", "", "Carica il dataset della Regione corretta oppure verifica il nome del Comune."));
    } else {
      item.appendChild(createElement("h3", "item-title", "Nessuna corrispondenza nei dataset"));
      item.appendChild(createElement("p", "", "L’indirizzo non è stato trovato nei file consultati. Questo risultato non consente di dedurre la copertura o la velocità disponibile. Verifica la grafia di Comune, Via e Civico."));
    }
    container.appendChild(item);
    $("results-card").hidden = false;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const result of results) {
    const record = getPrimaryRecord(result);
    if (!record) continue;
    const item = createElement("article", "result-item");
    const address = formatAddress(record);
    const primaryExtraKey = getPrimaryExtraKey(result);
    item.appendChild(createElement("h3", "item-title", "Esito: " + getPrimaryDatasetLabel(result)));
    item.appendChild(createElement("h4", "item-address", address));
    addLine(item, "ID EGON", result.id || record.id || "Non disponibile");

    if (result.general) {
      const code = result.general.characteristic;
      addLine(item, "Esito mappatura reti fisse", "Civico presente nell’elenco degli esiti Infratel 2025");
      const characteristic = createElement("span", "characteristic-value");
      if (code && DOTS[code]) {
        characteristic.appendChild(makeDot(code));
        characteristic.appendChild(document.createTextNode(" " + code + ": " + DOTS[code][1]));
      } else {
        characteristic.appendChild(document.createTextNode("ND: caratteristica non disponibile nel file"));
      }
      addLine(item, "Caratteristica", characteristic);
      addLine(item, "Consultazione", "Mappatura reti fisse 2025 · aggiornamento febbraio 2026");
    }

    if (result.pi1g) {
      addLine(item, "Esito PI1G", "Presente nell’Allegato A degli esiti 2025: civico non coperto entro il 2030 oppure tecnologia con velocità di picco non superiore a 300 Mbit/s");
      addLine(item, "Consultazione PI1G", "Pubblicazione Infratel · 16/02/2026");
    }

    renderExtraDatasets(item, result, primaryExtraKey);

    if (!result.general) {
      addLine(item, "Mappatura reti fisse 2025", getGeneralAbsenceMessage());
    }

    attachResultActions(item, result, address);
    fragment.appendChild(item);
  }

  container.appendChild(fragment);
  $("results-card").hidden = false;
  $("results-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

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

async function loadCsvReaderDataset() {
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
    const loaded = await requestCsvReaderDataset(region, dataset);
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


function legacyInput(id) {
  return $("legacy-" + id);
}

function legacySetStatus(message) {
  $("legacy-status").textContent = message || "";
}

function legacySetError(message) {
  $("legacy-error").textContent = message || "";
}

function legacyResetResult() {
  $("legacy-results").textContent = "";
  $("legacy-results").hidden = true;
}

function legacyFindExact(items, value, property) {
  if (property === "number") {
    const wanted = String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLocaleUpperCase("it");
    return items.find((item) => String(item.number ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLocaleUpperCase("it") === wanted) ?? null;
  }
  const wanted = normalise(value);
  return items.find((item) => normalise(property ? item[property] : item) === wanted) ?? null;
}

function legacyResetFrom(level) {
  const order = ["region", "province", "city", "street", "number"];
  const index = order.indexOf(level);

  for (const key of order.slice(index + 1)) {
    legacyState[key] = "";
    legacyInput(key).value = "";
    legacyInput(key).disabled = true;
    const listKey = ({ province: "provinces", city: "cities", street: "streets", number: "numbers" })[key];
    if (listKey) {
      legacyTokens[listKey] += 1;
      legacyLists[listKey] = [];
      $("legacy-" + listKey + "-options").textContent = "";
    }
  }

  if (index < 4) {
    legacyTokens.record += 1;
    legacyState.egon = "";
    legacyNumberItems.length = 0;
    $("legacy-search").disabled = true;
    $("legacy-search").textContent = "Esegui ricerca Legacy";
  }
  legacyResetResult();
  legacySetError("");
}

function legacyFillList(key, items) {
  legacyLists[key] = items;
  const controlName = ({ regions: "region", provinces: "province", cities: "city", streets: "street", numbers: "number" })[key];
  renderOptions("legacy-" + key + "-options", items, key === "numbers");
  legacyInput(controlName).disabled = false;
}

async function legacyLoadList(key, request, label) {
  const token = ++legacyTokens[key];
  const inputName = ({ provinces: "province", cities: "city", streets: "street", numbers: "number" })[key];
  legacyInput(inputName).disabled = true;
  legacySetStatus("Caricamento " + label + " dall’API Handymenny…");
  legacySetError("");

  try {
    const items = await request();
    if (token !== legacyTokens[key]) return;
    if (!Array.isArray(items)) throw new Error("Formato della risposta API non riconosciuto per " + label + ".");

    if (key === "numbers") {
      const validItems = items.filter((item) => item && item.number !== undefined && item.egon !== undefined);
      legacyNumberItems.length = 0;
      for (const item of validItems) legacyNumberItems.push(item);
      legacyFillList(key, validItems);
      if (!validItems.length) legacySetError("L’API non restituisce civici per questa via.");
      legacySetStatus(validItems.length.toLocaleString("it-IT") + " civici disponibili.");
      return;
    }

    legacyFillList(key, items);
    legacySetStatus(items.length.toLocaleString("it-IT") + " " + label + " disponibili.");
    if (!items.length) legacySetError("L’API non restituisce voci per questa selezione.");
  } catch (error) {
    if (token !== legacyTokens[key]) return;
    legacyInput(inputName).disabled = true;
    legacySetStatus("");
    legacySetError(error.message || "Impossibile caricare i dati Legacy.");
  }
}

async function legacyLoadRegions() {
  legacyInput("region").disabled = true;
  legacySetStatus("Caricamento elenco Regioni dall’API Handymenny…");
  legacySetError("");

  try {
    const regions = await legacyClient.getRegions();
    if (!Array.isArray(regions)) throw new Error("Formato dell’elenco Regioni non riconosciuto.");
    legacyFillList("regions", regions);
    legacySetStatus(regions.length + " Regioni disponibili.");
  } catch (error) {
    legacySetStatus("");
    legacySetError(error.message || "API Handymenny non raggiungibile. Verifica la connessione e riprova.");
  }
}

function legacySetNumberSelection(value) {
  const selected = legacyFindExact(legacyNumberItems, value, "number");
  if (!selected) {
    const base = String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLocaleUpperCase("it").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/g, "");
    const matches = legacyNumberItems.filter((item) => String(item.number ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLocaleUpperCase("it").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/g, "") === base);
    if (matches.length > 1) {
      legacyState.egon = "";
      $("legacy-search").disabled = true;
      legacySetError("Questo civico ha più record distinti. Seleziona la voce completa, compreso l’eventuale suffisso.");
      return;
    }
    if (matches.length === 1) {
      legacyInput("number").value = matches[0].number;
      legacyState.number = matches[0].number;
      legacyState.egon = String(matches[0].egon);
      $("legacy-search").disabled = false;
      legacySetError("");
      legacySetStatus("Civico selezionato · ID EGON " + legacyState.egon);
      return;
    }

    legacyState.egon = "";
    $("legacy-search").disabled = true;
    legacySetError("Seleziona un civico presente nell’elenco suggerito dall’API.");
    return;
  }

  legacyState.number = selected.number;
  legacyState.egon = String(selected.egon);
  legacyInput("number").value = selected.number;
  $("legacy-search").disabled = !legacyState.egon;
  legacySetError("");
  legacySetStatus("Civico selezionato · ID EGON " + legacyState.egon);
}

function bindLegacyLevel(key) {
  const input = legacyInput(key);
  const listKey = ({ region: "regions", province: "provinces", city: "cities", street: "streets" })[key];

  input.addEventListener("input", () => {
    if (normalise(input.value) !== normalise(legacyState[key])) {
      legacyState[key] = "";
      legacyResetFrom(key);
    }
  });

  input.addEventListener("change", () => {
    const selected = legacyFindExact(legacyLists[listKey] || [], input.value);
    if (!selected) {
      legacySetError("Seleziona una voce valida dall’elenco suggerito.");
      return;
    }

    input.value = selected;
    legacyState[key] = selected;
    legacyResetFrom(key);

    if (key === "region") {
      legacyLoadList("provinces", () => legacyClient.getProvinces(selected), "Province");
    } else if (key === "province") {
      legacyLoadList("cities", () => legacyClient.getCities(selected), "Comuni");
    } else if (key === "city") {
      legacyLoadList("streets", () => legacyClient.getStreets(legacyState.province, selected), "Vie");
    } else if (key === "street") {
      legacyLoadList("numbers", () => legacyClient.getNumbers(legacyState.province, legacyState.city, selected), "Civici");
    }
  });
}

function renderLegacyRecord(data) {
  const container = $("legacy-results");
  container.textContent = "";
  container.hidden = false;
  container.appendChild(createElement("h3", "item-title", "Esito archivio storico Handymenny"));
  container.appendChild(createElement("p", "legacy-disclaimer", "Dati storici della mappatura Infratel 2017-2021. Non costituiscono una verifica della copertura commerciale o della disponibilità attuale."));
  container.appendChild(createElement("p", "legacy-address", [
    legacyState.region,
    legacyState.province,
    legacyState.city,
    legacyState.street,
    legacyState.number
  ].filter(Boolean).join(" · ") + " · EGON " + legacyState.egon));
  renderLegacySections(container, data);

  const actions = createElement("div", "result-actions");
  const copy = createElement("button", "button button-small button-secondary", "Copia risultato Legacy");
  copy.type = "button";
  copy.addEventListener("click", () => copyText(legacyReport(data, legacyState.street + " " + legacyState.number + " · " + legacyState.city + " (" + legacyState.province + ")"), copy, "Copiato!"));
  actions.appendChild(copy);
  container.appendChild(actions);
  container.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function runLegacySearch() {
  if (!legacyState.egon) {
    legacySetError("Completa la selezione fino al Civico.");
    return;
  }

  const token = ++legacyTokens.record;
  const button = $("legacy-search");
  button.disabled = true;
  button.textContent = "Consultazione in corso…";
  legacyResetResult();
  legacySetError("");
  legacySetStatus("Recupero del record storico EGON " + legacyState.egon + "…");

  try {
    const data = await legacyClient.getRecord(legacyState.egon);
    if (token !== legacyTokens.record) return;
    if (!data || typeof data !== "object") throw new Error("L’API non ha restituito un record EGON valido.");
    if (data.egon !== undefined && String(data.egon) !== String(legacyState.egon)) {
      throw new Error("L’API ha restituito un ID EGON diverso da quello selezionato.");
    }
    renderLegacyRecord(data);
    legacySetStatus("Consultazione storica completata · ID EGON " + legacyState.egon);
  } catch (error) {
    if (token === legacyTokens.record) {
      legacySetError(error.message || "Errore durante la consultazione storica.");
      legacySetStatus("");
    }
  } finally {
    if (token === legacyTokens.record) {
      button.disabled = false;
      button.textContent = "Riesegui ricerca Legacy";
    }
  }
}

function clearLegacySearch() {
  legacyState.region = "";
  legacyState.province = "";
  legacyState.city = "";
  legacyState.street = "";
  legacyState.number = "";
  legacyState.egon = "";
  legacyNumberItems.length = 0;

  for (const key of ["region", "province", "city", "street", "number"]) {
    legacyInput(key).value = "";
    legacyInput(key).disabled = key !== "region";
  }
  for (const key of ["provinces", "cities", "streets", "numbers"]) {
    legacyLists[key] = [];
    $("legacy-" + key + "-options").textContent = "";
  }
  for (const key of Object.keys(legacyTokens)) legacyTokens[key] += 1;

  $("legacy-search").disabled = true;
  $("legacy-search").textContent = "Esegui ricerca Legacy";
  legacyResetResult();
  legacySetError("");
  if (legacyLists.regions.length) legacySetStatus("Elenco Regioni pronto.");
  else legacyLoadRegions();
}

function setLegacyMode(enabled) {
  state.legacyMode = Boolean(enabled);
  if (state.legacyMode && state.csvReaderMode) setCsvReaderMode(false);
  $("legacy-toggle").textContent = state.legacyMode ? "Legacy mode ON" : "Legacy mode OFF";
  $("legacy-toggle").setAttribute("aria-pressed", String(state.legacyMode));
  $("csv-reader-toggle").disabled = state.legacyMode;
  $("modern-search-card").hidden = state.legacyMode;
  $("legacy-search-card").hidden = !state.legacyMode;
  $("results-card").hidden = true;
  legacyResetResult();

  $("mode-help").textContent = state.legacyMode
    ? "Legacy mode ON: ricerca autonoma nell’archivio storico 2017-2021 di Handymenny. I campi dell’indirizzo vengono inviati al servizio API esterno."
    : state.csvReaderMode
      ? "CSV Reader ON: carica tutte le righe del dataset selezionato per la Regione scelta. La tabella conserva le intestazioni originali e l'ordine del CSV, mostrando 100 righe per pagina."
      : "Ricerca indirizzo: carica tutti i dataset regionali disponibili per suggerimenti e ricerca. Gli archivi ZIP restano nella cache IndexedDB del browser per 30 giorni; usa Aggiorna archivi per scaricare le versioni più recenti. CSV Reader apre volontariamente il CSV completo.";

  if (state.legacyMode && !legacyLists.regions.length) legacyLoadRegions();
}

function openDialog(view) {
  const isFaq = view === "faq";
  $("dialog-title").textContent = isFaq ? "FAQ" : "Changelog";
  $("faq-content").hidden = !isFaq;
  $("changelog-content").hidden = isFaq;
  const dialog = $("info-dialog");
  if (!dialog.open) dialog.showModal();
}

function bindEvents() {
  $("region").addEventListener("input", updateRegionHint);
  $("region").addEventListener("keydown", handleRegionEnter);
  $("region").addEventListener("change", loadSelectedRegion);
  $("search-form").addEventListener("submit", runSearch);
  $("clear-search").addEventListener("click", clearSearch);
  $("file-input").addEventListener("change", handleFileUpload);
  $("use-automatic-data").addEventListener("click", restoreAutomaticData);
  $("refresh-data-cache").addEventListener("click", refreshAutomaticArchives);
  $("csv-reader-toggle").addEventListener("click", () => setCsvReaderMode(!state.csvReaderMode));
  $("csv-reader-dataset").addEventListener("change", loadCsvReaderDataset);
  $("csv-reader-page-size").addEventListener("change", () => {
    state.readerPageSize = Number($("csv-reader-page-size").value) || 100;
    state.readerPage = 0;
    renderCsvReaderPage();
  });
  $("csv-reader-search").addEventListener("input", () => {
    state.readerQuery = $("csv-reader-search").value;
    state.readerPage = 0;
    window.clearTimeout(readerSearchTimer);
    readerSearchTimer = window.setTimeout(() => { void renderCsvReaderPage(); }, 160);
  });
  $("csv-reader-prev").addEventListener("click", () => {
    state.readerPage = Math.max(0, state.readerPage - 1);
    void renderCsvReaderPage();
  });
  $("csv-reader-next").addEventListener("click", () => {
    state.readerPage += 1;
    void renderCsvReaderPage();
  });

  for (const field of ["province", "city", "street", "number"]) {
    const inputId = field === "number" ? "street-number" : field;
    $(inputId).addEventListener("input", () => scheduleSuggestions(field));
    $(inputId).addEventListener("keydown", (event) => { void handleAutocompleteEnter(field, event); });
    if (field === "number") $(inputId).addEventListener("focus", () => scheduleSuggestions(field));
  }

  $("city").addEventListener("change", async () => {
    try {
      const record = await findCityRecord($("city").value);
      if (!record) return;
      if (!$("province").value) $("province").value = record.province;
      if (!$("region").value) {
        const option = REGIONS.find((item) => normalise(item) === record.normalisedRegion);
        if (option) {
          $("region").value = option;
          updateRegionHint();
          await loadSelectedRegion();
        }
      }
    } catch (error) {
      $("data-status").textContent = error.message || "Impossibile risolvere il Comune.";
    }
  });

  $("legacy-toggle").addEventListener("click", () => setLegacyMode(!state.legacyMode));
  for (const key of ["region", "province", "city", "street"]) bindLegacyLevel(key);
  legacyInput("number").addEventListener("change", () => legacySetNumberSelection(legacyInput("number").value));
  legacyInput("number").addEventListener("input", () => {
    if (normalise(legacyInput("number").value) !== normalise(legacyState.number)) {
      legacyState.number = "";
      legacyState.egon = "";
      $("legacy-search").disabled = true;
      legacyResetResult();
    }
  });
  $("legacy-search").addEventListener("click", runLegacySearch);
  $("legacy-clear").addEventListener("click", clearLegacySearch);

  $("open-faq").addEventListener("click", () => openDialog("faq"));
  $("open-changelog").addEventListener("click", () => openDialog("changelog"));
  $("build-tag").addEventListener("click", () => openDialog("changelog"));
  $("close-dialog").addEventListener("click", () => $("info-dialog").close());
  $("info-dialog").addEventListener("click", (event) => {
    if (event.target === $("info-dialog")) $("info-dialog").close();
  });
}

function initialise() {
  populateRegions();
  renderLegend();
  $("footer-source").textContent = "Basato sulla Mappatura reti fisse Infratel 2025 (layer ArcGIS aggiornato il 26/02/2026), sugli esiti PI1G 2025 (16/02/2026) e sulla mappa ArcGIS · MI25-6 di Elper.";
  state.readerPageSize = Number($("csv-reader-page-size").value) || 100;
  $("data-status").textContent = "Seleziona una Regione per caricare i dataset nel Web Worker.";
  setFileMessages([]);
  bindEvents();
}

initialise();
