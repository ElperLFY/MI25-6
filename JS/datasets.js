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

export const DOTS = {
  PA: ["#ff7fd0", "sede Pubblica Amministrazione in piani pubblici (scuole/sanità)"],
  A: ["#8a8a8a", "civico con scarsa qualità della coordinata"],
  B1: ["#ffa41c", "entro 50 m da civici del Piano BUL fibra ottica"],
  B2: ["#3fd62a", "entro 50 m da civici del Piano Italia a 1 Giga"],
  B3: ["#1f6fe5", "entro 50 m da civici dei privati fibra ottica realizzati al 2024"],
  BW: ["#ffee00", "entro 50 m da civici del Piano BUL FWA realizzato"],
  C: ["#e8231f", "oltre 50 m da reti con velocità di picco superiore a 300 Mbit/s"],
  B: ["#5b7fa6", "entro 50 m da reti con velocità di picco superiore a 300 Mbit/s"]
};
