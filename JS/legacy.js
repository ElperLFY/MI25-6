const API_BASE = "https://mappatura2024.amennillo.eu";
const REQUEST_TIMEOUT = 15000;

const PI1G_STATUS = {
  0: "No",
  1: "Sì",
  2: "Sì",
  3: "Civico di prossimità ammissibile",
  4: "No"
};

const SPEED_RANGES = {
  0: "< 30 Mbit/s",
  1: "< 300 Mbit/s",
  2: "≥ 300 Mbit/s",
  30: "30-99 Mbit/s",
  100: "100-199 Mbit/s",
  200: "200-299 Mbit/s",
  300: "300-999 Mbit/s",
  1000: "≥ 1000 Mbit/s"
};

const SPEED_RANGES_WHITE = {
  0: "< 300 Mbit/s",
  1: "≥ 300 Mbit/s"
};

const SPEED_RANGES_2017 = {
  0: "< 30 Mbit/s",
  30: "30-99 Mbit/s",
  100: "≥ 100 Mbit/s"
};

const WINNERS = {
  1: "Open Fiber",
  2: "FiberCop",
  3: "Open Fiber",
  4: "Open Fiber"
};

const WALKIN_STATUS = {
  0: "Ignoto",
  1: "Ignoto",
  2: "Inesistente",
  3: "Escluso no UI",
  4: "Escluso residuale",
  5: "Escluso già coperto",
  10: "Ignoto",
  11: "Esistente",
  12: "Inesistente",
  13: "Escluso no UI",
  14: "Escluso residuale",
  15: "Escluso già coperto"
};

export class LegacyClient {
  constructor() {
    this.cache = new Map();
  }

  async fetch(path) {
    if (this.cache.has(path)) return this.cache.get(path);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const request = fetch(API_BASE + path, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          const description = response.status === 404
            ? "Nessun dato trovato per la selezione effettuata."
            : response.status === 429
              ? "Limite richieste API raggiunto (HTTP 429). Attendi prima di riprovare."
              : "Errore API HTTP " + response.status + ".";
          throw new Error(description);
        }
        return response.json();
      })
      .catch((error) => {
        if (error.name === "AbortError") throw new Error("L’API storica non ha risposto entro 15 secondi.");
        throw error;
      })
      .finally(() => window.clearTimeout(timeout));

    this.cache.set(path, request);
    request.catch(() => this.cache.delete(path));
    return request;
  }

  getRegions() {
    return this.fetch("/regions");
  }

  getProvinces(region) {
    return this.fetch("/" + encodeURIComponent(region) + "/provinces");
  }

  getCities(province) {
    return this.fetch("/" + encodeURIComponent(province) + "/cities");
  }

  getStreets(province, city) {
    return this.fetch("/" + encodeURIComponent(province) + "/" + encodeURIComponent(city) + "/streets");
  }

  getNumbers(province, city, street) {
    return this.fetch("/" + encodeURIComponent(province) + "/" + encodeURIComponent(city) + "/" + encodeURIComponent(street) + "/numbers");
  }

  getRecord(egon) {
    return this.fetch("/egon?id=" + encodeURIComponent(egon));
  }
}

export function legacyText(value) {
  return value === null || value === undefined || value === "" ? "Non disponibile" : String(value);
}

export function legacyColor(value) {
  const colours = { "": "BIANCO", n: "NERO", g: "GRIGIO" };
  const key = String(value ?? "");
  return Object.prototype.hasOwnProperty.call(colours, key) ? colours[key] : "Codice: " + key;
}

export function legacyCodeClass(value) {
  if (value === null || value === undefined || value === "") return "Non disponibile";

  const code = String(value);
  const parts = [legacyColor(code.charAt(0))];
  if (code.charAt(1) === "v") parts.push("VHCN");
  else if (code.charAt(1) === "n" || code.charAt(0) === "n") parts.push("NGA");
  if (code.charAt(2) === "r") parts.push("RAME");
  else if (code.charAt(2) === "w") parts.push("FWA");
  else if (code.charAt(2) === "f") parts.push("FTTH");
  return parts.join(" · ");
}

function addRow(rows, label, value) {
  if (value !== null && value !== undefined && value !== "") rows.push({ label, value: String(value) });
}

export function legacySections(data) {
  const sections = [];
  let rows = [];

  addRow(rows, "Incluso nel bando", PI1G_STATUS[data.status_p1g] ?? legacyText(data.status_p1g));
  if (data.status_p1g && String(data.status_p1g) !== "4") {
    addRow(rows, "Vincitore bando", WINNERS[data.status_p1g] ?? "Non specificato");
  }
  if (data.walkin_connetti !== null && data.walkin_connetti !== undefined) {
    addRow(rows, "Esito Walk-in", WALKIN_STATUS[data.walkin_connetti] ?? legacyText(data.walkin_connetti));
  }
  sections.push({ title: "Piano Italia 1 Giga · archivio storico", rows });

  if (data.below300Mbps_2024 !== null && data.below300Mbps_2024 !== undefined) {
    rows = [];
    addRow(rows, "Soglia 300 Mbit/s", SPEED_RANGES_WHITE[data.below300Mbps_2024] ?? legacyText(data.below300Mbps_2024));
    sections.push({ title: "Consultazione 2024", rows });
  }

  if (data.below300Mbps_2021 !== null && data.below300Mbps_2021 !== undefined) {
    rows = [];
    if (data.color_2021 !== null && data.color_2021 !== undefined) addRow(rows, "Colore civico", legacyColor(data.color_2021));
    const ranges = data.color_2021 === null || data.color_2021 === undefined ? SPEED_RANGES_WHITE : SPEED_RANGES;
    addRow(rows, "Velocità massima", ranges[data.below300Mbps_2021] ?? legacyText(data.below300Mbps_2021));
    addRow(rows, "Velocità ore di punta", ranges[data.peakSpeed_2021] ?? legacyText(data.peakSpeed_2021));
    sections.push({ title: "Consultazione 2021", rows });
  }

  if (data.class19_2020 !== null && data.class19_2020 !== undefined) {
    rows = [];
    addRow(rows, "Copertura 2019", legacyCodeClass(data.class19_2020));
    addRow(rows, "Copertura 2022", legacyCodeClass(data.class22_2020));
    sections.push({ title: "Consultazione 2020", rows });
  }

  if (data.cat18_2019 !== null && data.cat18_2019 !== undefined) {
    rows = [];
    addRow(rows, "Velocità massima 2018", SPEED_RANGES_2017[data.cat18_2019] ?? legacyText(data.cat18_2019));
    addRow(rows, "Velocità massima 2021", SPEED_RANGES_2017[data.cat21_2019] ?? legacyText(data.cat21_2019));
    sections.push({ title: "Consultazione 2019", rows });
  }

  if (data.speed20_2017 !== null && data.speed20_2017 !== undefined) {
    rows = [];
    addRow(rows, "Velocità massima 2020", SPEED_RANGES_2017[data.speed20_2017] ?? legacyText(data.speed20_2017));
    sections.push({ title: "Consultazione 2017", rows });
  }

  rows = [];
  addRow(rows, "ID EGON", legacyText(data.egon));
  addRow(rows, "ID Comune storico", legacyText(data.cityId));
  addRow(rows, "Via registrata", legacyText(data.street));
  addRow(rows, "Civico registrato", legacyText(data.number));
  sections.push({ title: "Identificativi e provenienza", rows });

  return sections;
}

export function legacyReport(data, address) {
  const lines = [
    "Archivio storico Handymenny · Mappatura Infratel 2017-2021",
    "Indirizzo: " + address,
    "ID EGON: " + legacyText(data.egon)
  ];

  for (const section of legacySections(data)) {
    for (const row of section.rows) lines.push(section.title + " · " + row.label + ": " + row.value);
  }

  lines.push("Fonte: API archivio storico Handymenny, " + API_BASE);
  lines.push("Nota: dati storici, non equivalenti a copertura commerciale o disponibilità attuale.");
  return lines.join("\n");
}
