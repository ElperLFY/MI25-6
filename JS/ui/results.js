import { DATASET_DEFINITIONS, DOTS, EXTRA_DATASET_KEYS, decodeFixedSurvey2021Color, decodeFixedSurvey2021Speed, normalise } from "../data/index.js?v=1.3.000";
import { legacyReport, legacySections } from "../legacy.js";

export function createResultsRenderer({ $, createElement, state, legacyClient, getGeneralAbsenceMessage, copyText }) {
  function addLine(container, label, value) {
    const row = createElement("div", "result-line");
    row.appendChild(createElement("span", "result-label", label));
    if (value instanceof Node) row.appendChild(value);
    else row.appendChild(document.createTextNode(" " + String(value)));
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
    const number = record.fullAddress && record.street === record.fullAddress ? "" :
      noNumber ? (normalise(record.suffix) === "SNC" || normalise(record.number) === "0" ? "SNC" : "") :
      [record.number, record.suffix].filter(Boolean).join("/");
    return [record.street || record.fullAddress, number,
      record.district ? record.district + ", " + record.city : record.city,
      record.province ? "(" + record.province + ")" : "", record.region].filter(Boolean).join(" ");
  }
  function getPrimaryRecord(result) {
    if (result.general || result.pi1g) return result.general || result.pi1g;
    for (const key of EXTRA_DATASET_KEYS) { const record = result.datasets[key]?.[0]; if (record) return record; }
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

  if (key === "privateProximity2025") {
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
    } else if (state.pi1gAvailable || state.manualPi1g) {
      addLine(item, "Esito PI1G", "Nessun record corrispondente nell’Allegato A caricato per questa Regione. L’assenza dall’Allegato A non certifica la copertura commerciale.");
    } else {
      addLine(item, "Esito PI1G", "Archivio regionale non caricato o non verificato.");
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

  return { renderResults, formatAddress, getPrimaryRecord, getPrimaryExtraKey, getPrimaryDatasetLabel };
}
