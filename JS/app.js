import {
  DATASET_DEFINITIONS,
  DOTS,
  EXTRA_DATASET_KEYS,
  decodeFixedSurvey2021Color,
  decodeFixedSurvey2021Speed,
  REGIONS,
  collectRecords,
  cityIsKnown,
  getSuggestions,
  loadRegionalData,
  normalise,
  parseUploadedFiles,
  searchRecords
} from "./data.js";
import {
  LegacyClient,
  legacyReport,
  legacySections,
  legacyText
} from "./legacy.js";

const $ = (id) => document.getElementById(id);
const legacyClient = new LegacyClient();

const state = {
  general: [],
  pi1g: [],
  manualGeneral: false,
  manualPi1g: false,
  extra: Object.fromEntries(EXTRA_DATASET_KEYS.map((key) => [key, []])),
  manualExtras: new Set(),
  loadToken: 0,
  searchToken: 0,
  pi1gAvailable: false,
  extraAvailability: {},
  checkedExtras: new Set(),
  legacyMode: false,
  csvReaderMode: false,
  readerRecords: [],
  readerPage: 0,
  readerPageSize: 100,
  readerLoadToken: 0
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
  if (state.general.length || state.manualGeneral) {
    return "Nessuna corrispondenza nel sottoinsieme degli esiti pubblicati 2025; questo dato, da solo, non dimostra assenza di copertura.";
  }
  return "Dataset della mappatura generale 2025 non disponibile per questa ricerca.";
}

function allRecords() {
  return collectRecords(state.general, state.pi1g, state.extra);
}

function hasRecords() {
  if (state.general.length || state.pi1g.length) return true;
  return EXTRA_DATASET_KEYS.some((key) => state.extra[key].length > 0);
}

function populateRegions() {
  for (const region of REGIONS) {
    const option = createElement("option", "", region);
    option.value = region;
    $("region").appendChild(option);
  }
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
    "Mappatura generale: " + state.general.length.toLocaleString("it-IT") + " record",
    pi1gAvailable
      ? "Allegato A PI1G: " + state.pi1g.length.toLocaleString("it-IT") + " record"
      : "Allegato A PI1G: archivio regionale non disponibile"
  ];

  for (const key of EXTRA_DATASET_KEYS) {
    const count = state.extra[key].length;
    if (state.manualExtras.has(key)) {
      messages.push(DATASET_DEFINITIONS[key].label + ": file manuale · " + count.toLocaleString("it-IT") + " record");
    } else if (state.checkedExtras.has(key)) {
      messages.push(DATASET_DEFINITIONS[key].label + ": " + count.toLocaleString("it-IT") + " corrispondenze per l'indirizzo");
    } else if (extraAvailable[key] === false) {
      messages.push(DATASET_DEFINITIONS[key].label + ": archivio regionale non disponibile");
    } else {
      messages.push(DATASET_DEFINITIONS[key].label + ": consultazione mirata dopo l'invio della ricerca");
    }
  }

  if (state.manualGeneral) messages[0] = "Mappatura generale: file manuale attivo · " + state.general.length.toLocaleString("it-IT") + " record";
  if (state.manualPi1g) messages[1] = "Allegato A PI1G: file manuale attivo · " + state.pi1g.length.toLocaleString("it-IT") + " record";

  $("data-status").textContent = region + " · " + messages.join(" · ");
}

async function loadSelectedRegion() {
  const region = $("region").value;
  const token = ++state.loadToken;
  state.searchToken += 1;
  $("results-card").hidden = true;
  $("search-error").textContent = "";
  state.checkedExtras.clear();
  state.extraAvailability = {};

  if (!region) {
    if (!state.manualGeneral) state.general = [];
    if (!state.manualPi1g) state.pi1g = [];
    for (const key of EXTRA_DATASET_KEYS) {
      if (!state.manualExtras.has(key)) state.extra[key] = [];
    }
    $("region-hint").textContent = "Seleziona una Regione per attivare i suggerimenti.";
    $("data-status").textContent = "Seleziona una Regione per caricare i dataset principali.";
    $("search-button").disabled = false;
    if (state.csvReaderMode) {
      state.readerRecords = [];
      $("csv-reader-status").textContent = "Seleziona una Regione per leggere il CSV.";
      renderCsvReaderPage();
    }
    return;
  }

  $("region-hint").textContent = "Suggerimenti dai dataset principali; gli archivi aggiuntivi vengono interrogati dopo la ricerca.";
  const loadGeneral = !state.manualGeneral;
  const loadPi1g = !state.manualPi1g;

  for (const key of EXTRA_DATASET_KEYS) {
    if (!state.manualExtras.has(key)) state.extra[key] = [];
  }

  if (!loadGeneral && !loadPi1g) {
    setAutomaticStatus(region, state.pi1gAvailable);
    if (state.csvReaderMode) await loadCsvReaderDataset();
    return;
  }

  $("search-button").disabled = true;
  $("data-status").textContent = "Caricamento dei dataset principali di " + region + "…";

  try {
    const loaded = await loadRegionalData(region, {
      loadGeneral,
      loadPi1g,
      loadExtras: []
    });
    if (token !== state.loadToken) return;

    if (loadGeneral) state.general = loaded.general || [];
    if (loadPi1g) state.pi1g = loaded.pi1g || [];
    state.pi1gAvailable = loaded.hasPi1gArchive;
    setAutomaticStatus(region, loaded.hasPi1gArchive, state.extraAvailability);

    const errors = Object.entries(loaded.extraErrors || {});
    if (errors.length) {
      $("data-status").textContent += " · " + errors.map(([key, message]) => DATASET_DEFINITIONS[key].label + ": " + message).join(" · ");
    }
    scheduleSuggestions("province");
  } catch (error) {
    if (token !== state.loadToken) return;
    if (loadGeneral) state.general = [];
    if (loadPi1g) state.pi1g = [];
    $("data-status").textContent = "Impossibile caricare i dataset principali di " + region + ". " + (error.message || "Verifica i file o carica i dataset manualmente.");
  } finally {
    if (token === state.loadToken) {
      $("search-button").disabled = false;
      if (state.csvReaderMode) await loadCsvReaderDataset();
    }
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

function updateSuggestions(field) {
  const mapping = {
    province: ["province", "province-options"],
    city: ["city", "city-options"],
    street: ["street", "street-options"],
    number: ["street-number", "number-options"]
  };
  const [inputId, listId] = mapping[field];
  const input = $(inputId);
  const records = allRecords();
  const values = getSuggestions(field, input.value, currentSearchState(), records);
  suggestionValues[field] = values.slice(0, 40);
  renderOptions(listId, suggestionValues[field]);
  updateFieldHint(field, input.value, values);
}

function scheduleSuggestions(field) {
  window.clearTimeout(suggestionTimers[field]);
  suggestionTimers[field] = window.setTimeout(() => updateSuggestions(field), 120);
}

function handleAutocompleteEnter(field, event) {
  if (event.key !== "Enter") return;
  event.preventDefault();

  const inputId = field === "number" ? "street-number" : field;
  const input = $(inputId);
  const typed = input.value.trim();
  if (!typed && field !== "number") return;

  const values = suggestionValues[field] || [];
  const normalised = normalise(typed);
  const selected = values.find((value) => normalise(value) === normalised)
    || values.find((value) => normalise(value).startsWith(normalised))
    || (values.length === 1 ? values[0] : null);
  if (selected) input.value = selected;

  if (field === "city") {
    const city = normalise(input.value);
    const record = allRecords().find((item) => item.normalisedCity === city);
    if (record && !$("province").value) $("province").value = record.province;
  }

  if (field === "number") {
    $("search-form").requestSubmit();
    return;
  }

  const next = ({ province: "city", city: "street", street: "number" })[field];
  if (!next) return;
  const nextInput = next === "number" ? $("street-number") : $(next);
  updateSuggestions(next);
  nextInput.focus();
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

function renderResults(results, query) {
  const container = $("results-list");
  container.textContent = "";

  if (!results.length) {
    const item = createElement("div", "result-item");
    if (!cityIsKnown(state.general, state.pi1g, state.extra, query.city, $("region").value)) {
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

const READER_DATASET_KEYS = new Set([
  "general2025",
  "pi1g2025",
  ...EXTRA_DATASET_KEYS
]);

function getReaderHeaders(records) {
  const headers = [];
  const seenHeaders = new Set();
  const seenFiles = new Set();

  for (const record of records) {
    const sourceFile = record.sourceFile || "CSV";
    if (seenFiles.has(sourceFile)) continue;
    seenFiles.add(sourceFile);
    for (const field of record.sourceFields || []) {
      const name = String(field.name ?? "").trim();
      const key = name || "Colonna senza nome";
      if (seenHeaders.has(key)) continue;
      seenHeaders.add(key);
      headers.push(key);
    }
  }
  return headers;
}

function renderCsvReaderPage() {
  const records = state.readerRecords;
  const pageSize = state.readerPageSize;
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  state.readerPage = Math.min(state.readerPage, totalPages - 1);
  const start = state.readerPage * pageSize;
  const end = Math.min(start + pageSize, records.length);
  const head = $("csv-reader-head");
  const body = $("csv-reader-body");
  head.textContent = "";
  body.textContent = "";

  $("csv-reader-prev").disabled = !records.length || state.readerPage === 0;
  $("csv-reader-next").disabled = !records.length || state.readerPage >= totalPages - 1;

  if (!records.length) {
    $("csv-reader-page-info").textContent = "Nessuna riga da visualizzare";
    return;
  }

  const headers = getReaderHeaders(records);
  if (!headers.length) {
    $("csv-reader-page-info").textContent = "Il file non contiene intestazioni leggibili.";
    return;
  }

  const headerRow = createElement("tr");
  for (const name of headers) {
    const cell = createElement("th", "", name);
    cell.scope = "col";
    headerRow.appendChild(cell);
  }
  headerRow.appendChild(createElement("th", "", "File sorgente"));
  head.appendChild(headerRow);

  const fragment = document.createDocumentFragment();
  for (let index = start; index < end; index += 1) {
    const record = records[index];
    const values = new Map((record.sourceFields || []).map((field) => [
      String(field.name ?? "").trim() || "Colonna senza nome",
      field.value
    ]));
    const row = createElement("tr");
    for (const name of headers) {
      row.appendChild(createElement("td", "", values.get(name) ?? ""));
    }
    row.appendChild(createElement("td", "", record.sourceFile || ""));
    fragment.appendChild(row);
  }
  body.appendChild(fragment);
  $("csv-reader-page-info").textContent =
    "Righe " + (start + 1).toLocaleString("it-IT") + "–" + end.toLocaleString("it-IT")
    + " di " + records.length.toLocaleString("it-IT")
    + " · ordine originale dei CSV";
}

async function loadCsvReaderDataset() {
  const region = $("region").value;
  const dataset = $("csv-reader-dataset").value;
  const token = ++state.readerLoadToken;
  state.readerRecords = [];
  state.readerPage = 0;
  renderCsvReaderPage();

  if (!region) {
    $("csv-reader-status").textContent = "Seleziona una Regione prima di aprire il CSV Reader.";
    return;
  }
  if (!READER_DATASET_KEYS.has(dataset)) {
    $("csv-reader-status").textContent = "Dataset non riconosciuto.";
    return;
  }

  const label = DATASET_DEFINITIONS[dataset]?.label || "Dataset";
  $("csv-reader-status").textContent = "Lettura completa di " + label + " per " + region + "…";
  $("csv-reader-dataset").disabled = true;
  $("csv-reader-page-size").disabled = true;

  try {
    const loaded = await loadRegionalData(region, {
      loadGeneral: dataset === "general2025",
      loadPi1g: dataset === "pi1g2025",
      loadExtras: EXTRA_DATASET_KEYS.includes(dataset) ? [dataset] : [],
      includeSourceFields: true
    });
    if (token !== state.readerLoadToken || !state.csvReaderMode) return;

    if (dataset === "general2025") state.readerRecords = loaded.general || [];
    else if (dataset === "pi1g2025") state.readerRecords = loaded.pi1g || [];
    else state.readerRecords = loaded.extra[dataset] || [];

    if (!state.readerRecords.length) {
      const available = dataset === "pi1g2025"
        ? loaded.hasPi1gArchive
        : (loaded.extraAvailable[dataset] ?? (dataset === "general2025"));
      $("csv-reader-status").textContent = available
        ? label + " · nessun record per " + region + "."
        : label + " · archivio regionale non disponibile per " + region + ".";
    } else {
      $("csv-reader-status").textContent = label + " · " + region + " · "
        + state.readerRecords.length.toLocaleString("it-IT") + " righe complete. Usa la paginazione per scorrerle.";
    }
    renderCsvReaderPage();
  } catch (error) {
    if (token !== state.readerLoadToken) return;
    state.readerRecords = [];
    renderCsvReaderPage();
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
    loadCsvReaderDataset();
  } else {
    state.readerLoadToken += 1;
    state.readerRecords = [];
    state.readerPage = 0;
    $("csv-reader-status").textContent = "CSV Reader disattivato.";
    renderCsvReaderPage();
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

  if (!$("region").value && !state.manualGeneral && !state.manualPi1g) {
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

  const region = $("region").value;
  const requestedExtras = region
    ? EXTRA_DATASET_KEYS.filter((key) => !state.manualExtras.has(key))
    : [];

  $("search-button").disabled = true;
  if (requestedExtras.length) {
    $("data-status").textContent = "Ricerca mirata di " + $("street").value
      + ($("street-number").value.trim() ? " " + $("street-number").value.trim() : "")
      + " nei dataset aggiuntivi…";
  }

  try {
    if (requestedExtras.length) {
      const loaded = await loadRegionalData(region, {
        loadGeneral: false,
        loadPi1g: false,
        loadExtras: requestedExtras,
        query
      });
      if (token !== state.searchToken) return;

      for (const key of requestedExtras) {
        state.extra[key] = loaded.extra[key] || [];
        state.extraAvailability[key] = loaded.extraAvailable[key] === true;
        state.checkedExtras.add(key);
      }
    }

    const results = searchRecords(state.general, state.pi1g, state.extra, query);
    renderResults(results, {
      city: $("city").value,
      province: $("province").value,
      street: $("street").value,
      number: $("street-number").value
    });

    if (region) setAutomaticStatus(region, state.pi1gAvailable, state.extraAvailability);
    const checkedCounts = requestedExtras.map((key) =>
      DATASET_DEFINITIONS[key].label + ": " + state.extra[key].length.toLocaleString("it-IT") + " record"
    );
    if (checkedCounts.length) {
      $("data-status").textContent += " · Ricerca mirata · " + checkedCounts.join(" · ");
    }
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
  $("number-hint").textContent = "";
  $("search-error").textContent = "";
  $("results-card").hidden = true;
  loadSelectedRegion();
}

async function handleFileUpload(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;

  setFileMessages(["Lettura dei file selezionati…"]);
  const imported = await parseUploadedFiles(files);
  let importedCount = 0;

  for (const [key, records] of Object.entries(imported.datasets)) {
    if (key === "general2025") {
      if (state.manualGeneral) {
        for (const record of records) state.general.push(record);
      } else {
        state.general = records;
      }
      state.manualGeneral = true;
      importedCount += records.length;
      continue;
    }
    if (key === "pi1g2025") {
      if (state.manualPi1g) {
        for (const record of records) state.pi1g.push(record);
      } else {
        state.pi1g = records;
      }
      state.manualPi1g = true;
      importedCount += records.length;
      continue;
    }
    if (!DATASET_DEFINITIONS[key]) continue;
    if (state.manualExtras.has(key)) {
      for (const record of records) state.extra[key].push(record);
    } else {
      state.extra[key] = records;
    }
    state.manualExtras.add(key);
    importedCount += records.length;
  }

  setFileMessages(imported.messages.length ? imported.messages : ["Nessun dataset riconosciuto nei file selezionati."]);
  if (importedCount) {
    const counts = [
      "Mappatura generale " + state.general.length.toLocaleString("it-IT"),
      "PI1G " + state.pi1g.length.toLocaleString("it-IT")
    ];
    for (const key of EXTRA_DATASET_KEYS) {
      if (state.extra[key].length) counts.push(DATASET_DEFINITIONS[key].label + " " + state.extra[key].length.toLocaleString("it-IT"));
    }
    $("data-status").textContent = "Dataset manuali attivi · " + counts.join(" · ");
    $("results-card").hidden = true;
    updateNumberHint();
  }
  event.target.value = "";
}

function restoreAutomaticData() {
  state.manualGeneral = false;
  state.manualPi1g = false;
  state.general = [];
  state.pi1g = [];
  state.manualExtras.clear();
  for (const key of EXTRA_DATASET_KEYS) state.extra[key] = [];
  setFileMessages(["Nessun file manuale attivo."]);
  loadSelectedRegion();
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
  $("legacy-toggle").textContent = state.legacyMode ? "Legacy mode ON" : "Legacy mode OFF";
  $("legacy-toggle").setAttribute("aria-pressed", String(state.legacyMode));
  $("modern-search-card").hidden = state.legacyMode;
  $("legacy-search-card").hidden = !state.legacyMode;
  $("results-card").hidden = true;
  legacyResetResult();

  $("mode-help").textContent = state.legacyMode
    ? "Legacy mode ON: ricerca autonoma nell’archivio storico 2017-2021 di Handymenny. I campi dell’indirizzo vengono inviati al servizio API esterno."
    : "Modalità standard: ricerca locale sui dataset Infratel 2025-26 caricati per Regione. Legacy mode consulta separatamente l’archivio storico 2017-2021 di Handymenny.";

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
  $("region").addEventListener("change", loadSelectedRegion);
  $("search-form").addEventListener("submit", runSearch);
  $("clear-search").addEventListener("click", clearSearch);
  $("file-input").addEventListener("change", handleFileUpload);
  $("use-automatic-data").addEventListener("click", restoreAutomaticData);

  for (const field of ["province", "city", "street", "number"]) {
    const inputId = field === "number" ? "street-number" : field;
    $(inputId).addEventListener("input", () => scheduleSuggestions(field));
    if (field === "number") $(inputId).addEventListener("focus", () => scheduleSuggestions(field));
  }

  $("city").addEventListener("change", () => {
    const city = normalise($("city").value);
    const record = allRecords().find((item) => item.normalisedCity === city);
    if (!record) return;
    if (!$("province").value) $("province").value = record.province;
    if (!$("region").value) {
      const option = [...$("region").options].find((item) => normalise(item.value) === record.normalisedRegion);
      if (option) {
        $("region").value = option.value;
        loadSelectedRegion();
      }
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
  $("data-status").textContent = "Seleziona una Regione per caricare i dataset automatici.";
  setFileMessages([]);
  bindEvents();
}

initialise();
