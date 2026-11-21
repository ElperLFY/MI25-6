import { legacyReport, legacySections } from "../legacy.js";
import { createLegacyAutocomplete } from "./legacy-autocomplete.js?v=1.3.1";

export function createLegacyController({
  $, state, normalise, createElement, copyText,
  setCsvReaderMode, legacyClient
}) {
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

const LEGACY_LIST_FIELDS = {
  regions: "region",
  provinces: "province",
  cities: "city",
  streets: "street",
  numbers: "number"
};

function legacyInput(id) {
  return $("legacy-" + id);
}

const legacyAutocomplete = createLegacyAutocomplete({
  $,
  normalise,
  onSelect(key, item) {
    if (key === "number") {
      legacySetNumberSelection(item && typeof item === "object" ? item.number : item);
      return;
    }
    const input = legacyInput(key);
    input.value = String(item);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
});

function clearLegacyOptions(key) {
  legacyAutocomplete.clear(LEGACY_LIST_FIELDS[key] || key);
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
    legacyAutocomplete.setDisabled(key, true);
    const listKey = ({ province: "provinces", city: "cities", street: "streets", number: "numbers" })[key];
    if (listKey) {
      legacyTokens[listKey] += 1;
      legacyLists[listKey] = [];
      clearLegacyOptions(listKey);
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
  legacyAutocomplete.setOptions(controlName, items);
  legacyAutocomplete.setDisabled(controlName, false);
}

async function legacyLoadList(key, request, label) {
  const token = ++legacyTokens[key];
  const inputName = ({ provinces: "province", cities: "city", streets: "street", numbers: "number" })[key];
  legacyAutocomplete.setDisabled(inputName, true);
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
    legacyAutocomplete.setDisabled(inputName, true);
    legacySetStatus("");
    legacySetError(error.message || "Impossibile caricare i dati Legacy.");
  }
}

async function legacyLoadRegions() {
  legacyAutocomplete.setDisabled("region", true);
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

function legacyHandleNumberInput() {
  if (normalise(legacyInput("number").value) !== normalise(legacyState.number)) {
    legacyState.number = "";
    legacyState.egon = "";
    $("legacy-search").disabled = true;
    legacyResetResult();
  }
}

function bindLegacyLevel(key) {
  const input = legacyInput(key);
  legacyAutocomplete.bind(key);

  if (key === "number") {
    input.addEventListener("input", legacyHandleNumberInput);
    input.addEventListener("change", () => legacySetNumberSelection(input.value));
    return;
  }

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

function renderLegacySections(container, data) {
  for (const section of legacySections(data)) {
    const sectionElement = createElement("section", "legacy-section");
    sectionElement.appendChild(createElement("h4", "", section.title));

    for (const row of section.rows) {
      const rowElement = createElement("div", "legacy-row");
      rowElement.appendChild(createElement("span", "result-label", row.label + ":"));
      rowElement.appendChild(document.createTextNode(" " + row.value));
      sectionElement.appendChild(rowElement);
    }

    container.appendChild(sectionElement);
  }
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
    legacyAutocomplete.setDisabled(key, key !== "region");
  }
  for (const key of ["provinces", "cities", "streets", "numbers"]) {
    legacyLists[key] = [];
    clearLegacyOptions(key);
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

  const modeHelp = $("mode-help");
  if (modeHelp) {
    modeHelp.textContent = state.legacyMode
      ? "Archivio storico attivo: stai consultando i dati 2017–2021 di Handymenny. L’indirizzo e l’ID EGON vengono inviati al servizio esterno."
      : state.csvReaderMode
        ? "CSV Reader attivo: scegli un dataset, cerca tra le righe e sfoglia le pagine."
        : "Ricerca indirizzo: seleziona una Regione per consultare i dati disponibili. Per conoscere gli altri strumenti, apri DESCRIZIONE.";
  }

  if (state.legacyMode && !legacyLists.regions.length) legacyLoadRegions();
}


  return {
    bindLegacyLevel,
    runLegacySearch, clearLegacySearch, setLegacyMode, legacyLoadRegions
  };
}
