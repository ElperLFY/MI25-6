import {
  DOTS, EXTRA_DATASET_KEYS, REGIONS, normalise
} from "./data/index.js";
import {
  cityIsKnown, clearArchiveCache, clearManualDatasets, findCityRecord,
  getCsvReaderPage, getSuggestions, loadCsvReaderDataset as requestCsvReaderDataset,
  loadRegionalData, parseUploadedFiles, releaseCsvReader, searchRecords
} from "./services/data-client.js";
import { createResultsRenderer } from "./ui/results.js";
import { createCsvReaderController } from "./controllers/csv-reader.js";

import { LegacyClient } from "./legacy.js";
import { createLegacyController } from "./controllers/legacy-controller.js";
import { createAutocompleteController } from "./controllers/autocomplete.js";
import { createRegionDataController } from "./controllers/region-data.js";
import { createSearchController } from "./controllers/search.js";

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


let readerSearchTimer = null;
const suggestionValues = { province: [], city: [], street: [], number: [] };

function copyText(text, button, successLabel) {
  const originalLabel = button.textContent;
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        button.textContent = successLabel; button.disabled = true;
        window.setTimeout(() => { button.textContent = originalLabel; button.disabled = false; }, 1500);
      }).catch(() => { button.textContent = "Copia non riuscita"; });
    } else {
      const field = createElement("textarea"); field.value = text; field.setAttribute("readonly", "");
      field.className = "copy-fallback"; document.body.appendChild(field); field.select();
      const copied = document.execCommand("copy"); field.remove();
      button.textContent = copied ? successLabel : "Copia non riuscita";
    }
  } catch { button.textContent = "Copia non riuscita"; }
}



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
  list.hidden = messages.length === 0;
  if (!messages.length) return;
  for (const message of messages) list.appendChild(createElement("div", "file-entry", message));
}





function openDialog(view) {
  const isFaq = view === "faq";
  $("dialog-title").textContent = isFaq ? "FAQ" : "Changelog";
  $("faq-content").hidden = !isFaq;
  $("changelog-content").hidden = isFaq;
  const dialog = $("info-dialog");
  if (!dialog.open) dialog.showModal();
}

function updateTheme(isBlue, persist = false) {
  if (isBlue) document.documentElement.dataset.theme = "blue";
  else delete document.documentElement.dataset.theme;

  const button = $("theme-toggle");
  button.setAttribute("aria-pressed", String(isBlue));
  button.setAttribute("aria-label", isBlue ? "Disattiva Blu mode" : "Attiva Blu mode");
  button.title = isBlue ? "Disattiva Blu mode" : "Attiva Blu mode";
  button.querySelector('[data-theme-icon="moon"]').hidden = isBlue;
  button.querySelector('[data-theme-icon="sun"]').hidden = !isBlue;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = isBlue ? "#174b83" : "#8c1230";

  if (persist) {
    try {
      window.localStorage.setItem("mi25-6-theme", isBlue ? "blue" : "default");
    } catch {
      // Il tema resta attivo per la sessione anche se lo storage non è disponibile.
    }
  }
}

function initialiseTheme() {
  let useBlue = false;
  try {
    useBlue = window.localStorage.getItem("mi25-6-theme") === "blue";
  } catch {
    // In modalità privata o con storage disabilitato si usa il tema predefinito.
  }
  updateTheme(useBlue);
}

function activateDescriptionTab(selectedTab) {
  const selectedKey = selectedTab.dataset.descriptionTab;
  for (const tab of document.querySelectorAll("[data-description-tab]")) {
    const selected = tab === selectedTab;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of document.querySelectorAll("[data-description-panel]")) {
    panel.hidden = panel.dataset.descriptionPanel !== selectedKey;
  }
}



const autocomplete = createAutocompleteController({
  $, getSuggestions, findCityRecord, normalise, currentSearchState, renderOptions, suggestionValues
});
const scheduleSuggestions = autocomplete.scheduleSuggestions;
const handleAutocompleteEnter = autocomplete.handleAutocompleteEnter;

const resultsRenderer = createResultsRenderer({
  $, createElement, state, legacyClient,
  getGeneralAbsenceMessage: () => (state.generalCount || state.manualGeneral)
    ? "Nessuna corrispondenza nel sottoinsieme degli esiti pubblicati 2025; questo dato, da solo, non dimostra assenza di copertura."
    : "Dataset della mappatura generale 2025 non disponibile per questa ricerca.",
  copyText
});
const renderResults = resultsRenderer.renderResults;

const csvReader = createCsvReaderController({
  $, state, createElement, getCsvReaderPage,
  loadCsvReaderDataset: requestCsvReaderDataset, releaseCsvReader
});
const renderCsvReaderPage = csvReader.renderCsvReaderPage;
const loadCsvReaderDataset = csvReader.loadCsvReaderDataset;
const setCsvReaderMode = csvReader.setCsvReaderMode;

const legacy = createLegacyController({
  $, state, normalise, createElement, renderOptions, copyText,
  setCsvReaderMode, legacyClient
});
const legacyInput = legacy.legacyInput;
const legacySetNumberSelection = legacy.legacySetNumberSelection;
const legacyHandleNumberInput = legacy.legacyHandleNumberInput;
const bindLegacyLevel = legacy.bindLegacyLevel;
const runLegacySearch = legacy.runLegacySearch;
const clearLegacySearch = legacy.clearLegacySearch;
const setLegacyMode = legacy.setLegacyMode;

const regionData = createRegionDataController({
  $, state, loadRegionalData, clearArchiveCache,
  scheduleSuggestions, renderCsvReaderPage, loadCsvReaderDataset
});
const setAutomaticStatus = regionData.setAutomaticStatus;
const loadSelectedRegion = regionData.loadSelectedRegion;
const refreshAutomaticArchives = regionData.refreshAutomaticArchives;
const searchController = createSearchController({
  $, state, searchRecords, cityIsKnown, parseUploadedFiles, clearManualDatasets,
  renderResults, setAutomaticStatus, setFileMessages, scheduleSuggestions, loadSelectedRegion, loadCsvReaderDataset
});
const runSearch = searchController.runSearch;
const clearSearch = searchController.clearSearch;
const handleFileUpload = searchController.handleFileUpload;
const restoreAutomaticData = searchController.restoreAutomaticData;




function bindEvents() {
  $("region").addEventListener("input", updateRegionHint);
  $("region").addEventListener("keydown", handleRegionEnter);
  $("region").addEventListener("change", loadSelectedRegion);
  $("search-form").addEventListener("submit", runSearch);
  $("clear-search").addEventListener("click", clearSearch);
  $("file-input").addEventListener("change", handleFileUpload);
  $("use-automatic-data").addEventListener("click", restoreAutomaticData);
  $("refresh-data-cache").addEventListener("click", refreshAutomaticArchives);
  $("theme-toggle").addEventListener("click", () => {
    updateTheme(document.documentElement.dataset.theme !== "blue", true);
  });

  const descriptionTabs = Array.from(document.querySelectorAll("[data-description-tab]"));
  if (descriptionTabs.length) {
    activateDescriptionTab(descriptionTabs[0]);
    descriptionTabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activateDescriptionTab(tab));
      tab.addEventListener("keydown", (event) => {
        let nextIndex = index;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % descriptionTabs.length;
        else if (event.key === "ArrowLeft") nextIndex = (index - 1 + descriptionTabs.length) % descriptionTabs.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = descriptionTabs.length - 1;
        else return;
        event.preventDefault();
        descriptionTabs[nextIndex].focus();
        activateDescriptionTab(descriptionTabs[nextIndex]);
      });
    });
  }

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
  legacyInput("number").addEventListener("input", legacyHandleNumberInput);
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
  $("footer-source").textContent = "Basato sulla Mappatura reti fisse Infratel 2021/2025 (layer ArcGIS aggiornato il 26/02/2026), sugli esiti PI1G 2025 (16/02/2026) e sull'API storica di TheEdoRan · MI25-6 di Elper.";
  state.readerPageSize = Number($("csv-reader-page-size").value) || 100;
  $("data-status").textContent = "Seleziona una Regione per caricare i dataset.";
  setFileMessages([]);
  initialiseTheme();
  bindEvents();
}

initialise();
