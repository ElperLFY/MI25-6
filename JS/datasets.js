export const DATASET_DEFINITIONS = {
  general2025: {
    label: "Mappatura reti fisse 2025",
    folder: "fixed-2025",
    archiveName: "italia.zip"
  },
  pi1g2025: {
    label: "Esiti PI1G 2025 · Allegato A",
    folder: "pi1g-2025",
    archiveName: "italia.zip"
  },
  fixedSurvey2021: {
    label: "Mappatura reti fisse 2021",
    folder: "fixed-2021",
    archiveName: "italia.zip"
  },
  proximity2025: {
    label: "Civici di prossimità 2025",
    folder: "proximity-2025",
    archiveName: "italia.zip"
  },
  fiberCopProximity2025: {
    label: "Civici di prossimità FiberCop 2025",
    folder: "fibercop-proximity-2025",
    archiveName: "italia.zip"
  }
};

export const REGIONS = Object.freeze([
  "Abruzzo",
  "Basilicata",
  "Calabria",
  "Campania",
  "Emilia-Romagna",
  "Friuli-Venezia Giulia",
  "Lazio",
  "Liguria",
  "Lombardia",
  "Marche",
  "Molise",
  "Piemonte",
  "Puglia",
  "Sardegna",
  "Sicilia",
  "Toscana",
  "Trentino-Alto Adige",
  "Umbria",
  "Valle d’Aosta",
  "Veneto"
]);

export const EXTRA_DATASET_KEYS = [
  "fixedSurvey2021",
  "proximity2025",
  "fiberCopProximity2025"
];

export const FIELD_ALIASES = {
  id: ["idegon", "codegonciv", "codegoncivico", "codiceegon", "egon", "idegonciv"],
  region: ["regione"],
  province: ["provincia"],
  city: ["comune", "nomecom", "nomecomune"],
  district: ["frazione"],
  procom: ["procom21", "procom2021"],
  street: ["strada", "via"],
  fullAddress: ["indirunito", "indirizzounito", "indirizzo", "address"],
  number: ["civico", "numerocivico"],
  suffix: ["barrato", "barratura"],
  km: ["km"],
  latitude: ["lat", "latitudine", "latitude"],
  longitude: ["long", "lon", "longitudine", "longitude"],
  characteristic: ["caratteristica"],
  operator: ["operatore"],
  nga: ["nga"],
  technology: ["tecn", "tecnologia"],
  maxDownload: ["velmaxdown"],
  maxUpload: ["velmaxup"],
  peakDownload: ["peakveldown"],
  peakUpload: ["peakvelup"],
  vhcnClass: ["vhcnclass"],
  coverageYear: ["annocoper"],
  publicIntervention: ["intpubb"],
  numUiPassed: ["numuipassed"],
  gridId: ["gridid"],
  gridCivQuality: ["qgridciv"],
  publicPlan: ["pianolt1g"],
  proximityCiv: ["civicopross"],
  eligibility: ["ammissibilesino", "ammissibile"],
  exclusionReason: ["causeesclusione", "causaesclusione"],
  coveredJune2025: ["copertoagiugno2025", "copertoagiugno", "statogiugno25"],
  technologyJune2025: ["tecnogiugno25", "tecnologiagiugno25"],
  networkColor2026: ["colore26"],
  peakDownload2026: ["peakveldown26"],
  maxDownload2026: ["velmaxdown26"],
  sourceRow: ["row", "numero", "progressivo"],
  municipalityCode: ["codicecomune", "codcomune", "procom2017", "procom2021"],
  sectionCode: ["istsez", "codicesezione", "sezioneistat"]
};

export const FIXED_SURVEY_2021_COLOR_LABELS = Object.freeze({
  "": "Bianco",
  b: "Bianco",
  g: "Grigio",
  n: "Nero"
});

const FIXED_SURVEY_2021_SPEED_WITH_COLOR = Object.freeze({
  "0": "< 30 Mbit/s",
  "1": "< 300 Mbit/s",
  "2": "≥ 300 Mbit/s",
  "30": "30–99 Mbit/s",
  "100": "100–199 Mbit/s",
  "200": "200–299 Mbit/s",
  "300": "300–999 Mbit/s",
  "1000": "≥ 1.000 Mbit/s"
});

const FIXED_SURVEY_2021_SPEED_WITHOUT_COLOR = Object.freeze({
  "0": "< 300 Mbit/s",
  "1": "≥ 300 Mbit/s"
});

export function decodeFixedSurvey2021Color(value, columnPresent = true) {
  if (!columnPresent) return "";
  const code = String(value ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(FIXED_SURVEY_2021_COLOR_LABELS, code)
    ? FIXED_SURVEY_2021_COLOR_LABELS[code]
    : "Codice colore non riconosciuto (" + code + ")";
}

export function decodeFixedSurvey2021Speed(value, hasColorColumn = true) {
  const code = String(value ?? "").trim();
  if (!code) return "";
  const mapping = hasColorColumn
    ? FIXED_SURVEY_2021_SPEED_WITH_COLOR
    : FIXED_SURVEY_2021_SPEED_WITHOUT_COLOR;
  return Object.prototype.hasOwnProperty.call(mapping, code)
    ? mapping[code]
    : "Codice velocità non documentato (" + code + ")";
}

// Only characteristic values assigned to individual civics in the CSV are recognised here.
// B1, B2, B3 and BW are aggregate components of B in the Infratel report, not CSV characteristic codes.
export const DOTS = {
  PA: ["#ff7fd0", "sede Pubblica Amministrazione in piani pubblici (scuole/sanità)"],
  A: ["#8a8a8a", "civico con scarsa qualità della coordinata"],
  B: ["#5b7fa6", "entro 50 m da reti con velocità di picco superiore a 300 Mbit/s"],
  C: ["#e8231f", "oltre 50 m da reti con velocità di picco superiore a 300 Mbit/s"]
};
