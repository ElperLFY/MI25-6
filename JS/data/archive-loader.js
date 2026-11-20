import { DATASET_DEFINITIONS, EXTRA_DATASET_KEYS } from "../datasets.js?v=1.2.009";
import { normalise } from "./normalization.js";
import { decodeBuffer, headerKey, parseDataset, parseDatasetStream } from "./csv-parser.js?v=1.2.009";
import {
  getArchiveBytes,
  getParsedDatasetCache,
  putParsedDatasetCache
} from "./archive-cache.js?v=1.2.009";
import { measureAsync, measureSync, nowMs } from "./diagnostics.js";

const DATA_MANIFEST_URL = "data/manifest.json?v=1.2.009";
let dataManifestPromise = null;

async function getDatasetVersion(datasetKey, baseUrl = "") {
  if (!dataManifestPromise) {
    const manifestUrl = baseUrl ? new URL(DATA_MANIFEST_URL, baseUrl).href : DATA_MANIFEST_URL;
    dataManifestPromise = fetch(manifestUrl, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Impossibile leggere il manifest dei dataset (HTTP " + response.status + ").");
        const manifest = await response.json();
        if (!manifest || typeof manifest.datasets !== "object") {
          throw new Error("Il manifest dei dataset non ha una struttura valida.");
        }
        return manifest;
      })
      .catch((error) => {
        dataManifestPromise = null;
        throw error;
      });
  }

  const manifest = await dataManifestPromise;
  const version = manifest.datasets[datasetKey]?.dataVersion;
  if (typeof version !== "string" || !version.trim()) {
    throw new Error("Versione del dataset mancante nel manifest: " + datasetKey + ".");
  }
  return version.trim();
}

const PI1G_FILES = {
  Campania: "campania.zip",
  "Emilia-Romagna": "emilia-romagna.zip",
  "Friuli-Venezia Giulia": "friuli-venezia-giulia.zip",
  Lazio: "lazio.zip",
  Lombardia: "lombardia.zip",
  Puglia: "puglia.zip",
  Sicilia: "sicilia.zip",
  Toscana: "toscana.zip",
  Veneto: "veneto.zip"
};

const FIXED_SURVEY_2021_FILES = Object.freeze({
  Abruzzo: "ABRUZZO.zip",
  Basilicata: "BASILICATA.zip",
  Calabria: "CALABRIA.zip",
  Campania: "CAMPANIA.zip",
  "Emilia-Romagna": "EMILIA-ROMAGNA.zip",
  "Friuli-Venezia Giulia": "FRIULI-VENEZIAGIULIA.zip",
  Lazio: "LAZIO.zip",
  Liguria: "LIGURIA.zip",
  Marche: "MARCHE.zip",
  Molise: "MOLISE.zip",
  Puglia: "PUGLIA.zip",
  Sardegna: "SARDEGNA.zip",
  Sicilia: "SICILIA.zip",
  Toscana: "TOSCANA.zip",
  "Trentino-Alto Adige": "TRENTINO-ALTOADIGE.zip",
  "Valle d’Aosta": "VALLEDAOSTA.zip"
});

const MAX_FILE_SIZE = 200 * 1024 * 1024;
const MAX_ARCHIVE_SIZE = 1024 * 1024 * 1024;

function regionSlug(region) {
  return normalise(region).toLowerCase().replace(/ /g, "-");
}

function regionEntrySlugs(region) {
  if (region === "Trentino-Alto Adige") {
    return ["trentino-alto-adige", "trentino-alto-adige-bolzano", "trentino-alto-adige-trento", "bolzano", "trento"];
  }
  return [regionSlug(region)];
}

function entryMatchesRegion(filename, region) {
  const key = headerKey(filename.split("/").pop().replace(/\.(csv|txt|zip)$/i, ""));
  return regionEntrySlugs(region).some((slug) => key.includes(headerKey(slug)));
}

function matchesRegion(record, region) {
  if (!region) return true;
  const selected = normalise(region);
  return record.normalisedRegion === selected
    || record.normalisedRegion.startsWith(selected + " ")
    || (selected === "TRENTINO ALTO ADIGE" && record.normalisedRegion.startsWith("TRENTINO ALTO ADIGE"));
}

function recordsForRegion(records, region) {
  const filtered = [];
  for (const record of records) {
    if (matchesRegion(record, region)) filtered.push(record);
  }
  return filtered;
}

async function readArchiveEntries(archive, name, forcedType, region, budget, depth = 0, options = {}) {
  const allEntries = Object.values(archive.files).filter((entry) => !entry.dir);
  let archiveType = forcedType;
  const metadataEntry = allEntries.find((entry) => /(^|\/)dataset\.json$/i.test(entry.name));
  if (metadataEntry) {
    try {
      const metadata = JSON.parse(await metadataEntry.async("string"));
      if (metadata.dataset && DATASET_DEFINITIONS[metadata.dataset]) archiveType = metadata.dataset;
    } catch {
      archiveType = forcedType;
    }
  }

  let nestedArchives = allEntries
    .filter((entry) => /\.zip$/i.test(entry.name))
    .sort((first, second) => first.name.localeCompare(second.name));
  let dataEntries = allEntries
    .filter((entry) => /\.(csv|txt)$/i.test(entry.name))
    .sort((first, second) => first.name.localeCompare(second.name));

  // Nationwide Infratel packages contain one ZIP per region (for example SICILIA.zip).
  // Select only the requested region for a regional lookup; manual imports read all regions.
  if (region && nestedArchives.length > 1) {
    const regionalArchives = nestedArchives.filter((entry) => entryMatchesRegion(entry.name, region));
    if (regionalArchives.length) nestedArchives = regionalArchives;
  }
  if (region && dataEntries.length > 1) {
    const regionalEntries = dataEntries.filter((entry) => entryMatchesRegion(entry.name, region));
    if (regionalEntries.length) dataEntries = regionalEntries;
  }

  const parsed = [];
  for (const entry of nestedArchives) {
    if (depth >= 1) {
      throw new Error("Gli archivi ZIP regionali non devono contenere ulteriori archivi ZIP annidati.");
    }
    budget.expandedBytes += entry._data?.uncompressedSize ?? 0;
    if (budget.expandedBytes > MAX_ARCHIVE_SIZE) {
      throw new Error("L’archivio supera il limite di dimensione espansa consentito.");
    }
    const nestedBuffer = await measureAsync(options, "Decompressione ZIP regionale", () => entry.async("arraybuffer"), { entry: entry.name });
    const nestedArchive = await measureAsync(options, "Apertura ZIP regionale", () => globalThis.JSZip.loadAsync(nestedBuffer), { entry: entry.name });
    const nestedParsed = await readArchiveEntries(
      nestedArchive,
      entry.name || name,
      archiveType,
      region,
      budget,
      depth + 1,
      options
    );
    for (const dataset of nestedParsed) parsed.push(dataset);
  }

  for (const entry of dataEntries) {
    budget.expandedBytes += entry._data?.uncompressedSize ?? 0;
    if (budget.expandedBytes > MAX_ARCHIVE_SIZE) {
      throw new Error("L’archivio supera il limite di dimensione espansa consentito.");
    }

    const cachePath = options.cacheArchivePath || name;
    const cachedDataset = await getParsedDatasetCache(
      cachePath, region, archiveType, entry.name, options
    );
    if (cachedDataset) {
      parsed.push(cachedDataset);
      continue;
    }

    let dataset;
    if (typeof entry.internalStream === "function") {
      dataset = await measureAsync(options, "Decompressione CSV streaming", () => parseDatasetStream(
        entry.internalStream("uint8array"),
        entry.name || name,
        archiveType,
        options
      ), { entry: entry.name });
    } else {
      const csvBuffer = await measureAsync(options, "Decompressione CSV", () => entry.async("arraybuffer"), { entry: entry.name });
      const content = measureSync(options, "Decodifica CSV", () => decodeBuffer(csvBuffer), { entry: entry.name });
      dataset = measureSync(options, "Parsing CSV", () => parseDataset(content, entry.name || name, archiveType, options), { entry: entry.name });
    }
    if (dataset) {
      parsed.push(dataset);
      void putParsedDatasetCache(cachePath, region, dataset.id, entry.name, dataset, options).catch(() => {});
    }
  }

  return parsed;
}

async function readArchiveBuffer(buffer, name, forcedType = "", region = "", options = {}) {
  if (!globalThis.JSZip) throw new Error("La libreria JSZip non è disponibile.");
  const archive = await measureAsync(options, "Apertura archivio ZIP", () => globalThis.JSZip.loadAsync(buffer), { archive: name });
  const parsed = await readArchiveEntries(archive, name, forcedType, region, { expandedBytes: 0 }, 0, options);

  if (!parsed.length) {
    throw new Error("Nell’archivio non è stato trovato un CSV riconoscibile. Controlla che italia.zip contenga ZIP regionali (ad esempio SICILIA.zip) e che questi contengano CSV con intestazioni supportate.");
  }
  return parsed;
}
async function fetchArchive(paths, forcedType = "", region = "", options = {}) {
  const dataVersion = await getDatasetVersion(forcedType, options.baseUrl);
  const versionedOptions = { ...options, dataVersion };
  let lastError = null;
  for (const path of paths) {
    try {
      const buffer = await measureAsync(
        versionedOptions,
        "Lettura archivio (cache/rete)",
        () => getArchiveBytes(path, versionedOptions.baseUrl, versionedOptions),
        { path, dataVersion }
      );
      if (!buffer) continue;
      return await readArchiveBuffer(buffer, path, forcedType, region, {
        ...versionedOptions,
        cacheArchivePath: path
      });
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return null;
}

function collectDatasets(parsed) {
  const grouped = {};
  for (const dataset of parsed) {
    if (!DATASET_DEFINITIONS[dataset.id]) continue;
    if (!grouped[dataset.id]) grouped[dataset.id] = [];
    for (const record of dataset.records) grouped[dataset.id].push(record);
  }
  return grouped;
}

async function readOptionalRegionalDataset(key, region, options = {}) {
  const definition = DATASET_DEFINITIONS[key];
  const slug = regionSlug(region);
  const uploadedRegionalFile = key === "fixedSurvey2021"
    ? FIXED_SURVEY_2021_FILES[region]
    : "";
  const paths = Array.from(new Set([
    uploadedRegionalFile
      ? "data/" + definition.folder + "/" + uploadedRegionalFile
      : "",
    "data/" + definition.folder + "/" + slug + ".zip",
    "data/" + definition.folder + "/italia.zip",
    "data/" + definition.folder + "/Italia.zip",
    "data/" + definition.folder + "/" + definition.archiveName
  ].filter(Boolean)));
  const parsed = await fetchArchive(paths, key, region, options);
  if (!parsed) return { records: [], available: false };

  const groups = collectDatasets(parsed);
  return {
    records: recordsForRegion(groups[key] || [], region),
    available: true
  };
}

async function readGeneralRegion(region, options = {}) {
  const slugs = region === "Trentino-Alto Adige"
    ? ["trentino-alto-adige-bolzano", "trentino-alto-adige-trento"]
    : [regionSlug(region)];
  const records = [];

  for (const slug of slugs) {
    const paths = [
      "data/fixed-2025/" + slug + ".zip",
      "data/" + slug + ".zip"
    ];
    const parsed = await fetchArchive(paths, "general2025", region, options);
    if (!parsed) throw new Error("Archivio generale non trovato per " + region + ".");
    const groups = collectDatasets(parsed);
    const rows = groups.general2025 || [];
    for (const record of rows) records.push(record);
  }
  return records;
}

async function readPi1gRegion(region, options = {}) {
  const filename = PI1G_FILES[region];
  // Gli archivi regionali disponibili contengono tutti i 437.951 record dell'Allegato A.
  // Per le altre Regioni l'assenza del file corrisponde a zero record nell'Allegato A pubblicato.
  if (!filename) return { records: [], available: true };

  const paths = [
    "data/pi1g-2025/" + filename,
    "data/pi1g/" + filename
  ];
  const parsed = await fetchArchive(paths, "pi1g2025", region, options);
  if (!parsed) return { records: [], available: false };
  const groups = collectDatasets(parsed);
  return { records: recordsForRegion(groups.pi1g2025 || [], region), available: true };
}

export async function loadRegionalData(region, options = {}) {
  const loadGeneral = options.loadGeneral !== false;
  const loadPi1g = options.loadPi1g !== false;
  const requestedExtras = options.loadExtras || EXTRA_DATASET_KEYS;

  const totalStartedAt = nowMs();
  const timings = options.collectTimings === true ? [] : null;
  const parseOptions = {
    baseUrl: options.baseUrl,
    query: options.query,
    includeSourceFields: options.includeSourceFields === true,
    readerMode: options.readerMode === true,
    timings
  };
  const generalPromise = loadGeneral
    ? measureAsync({ timings, datasetKey: "general2025" }, "Tempo dataset", () => readGeneralRegion(region, { ...parseOptions, datasetKey: "general2025" }))
    : Promise.resolve(null);
  const pi1gPromise = loadPi1g
    ? measureAsync({ timings, datasetKey: "pi1g2025" }, "Tempo dataset", () => readPi1gRegion(region, { ...parseOptions, datasetKey: "pi1g2025" }))
    : Promise.resolve({ records: null, available: false });
  const extrasPromise = Promise.all(requestedExtras.map(async (key) => {
    const datasetOptions = { ...parseOptions, datasetKey: key };
    try {
      return [key, await measureAsync(datasetOptions, "Tempo dataset", () => readOptionalRegionalDataset(key, region, datasetOptions))];
    } catch (error) {
      return [key, { error: error.message || String(error), records: [] }];
    }
  }));

  const [general, pi1gResult, extraResults] = await Promise.all([
    generalPromise,
    pi1gPromise,
    extrasPromise
  ]);

  const extra = {};
  const extraErrors = {};
  const extraAvailable = {};
  for (const [key, value] of extraResults) {
    extra[key] = value.records || [];
    extraAvailable[key] = value.available === true;
    if (value.error) extraErrors[key] = value.error;
  }

  return {
    general,
    pi1g: pi1gResult.records,
    hasPi1gArchive: pi1gResult.available,
    extra,
    extraAvailable,
    extraErrors,
    timings: timings ? {
      totalMs: nowMs() - totalStartedAt,
      stages: timings
    } : null
  };
}

function datasetHintFromFilename(filename) {
  const key = headerKey(filename);
  if (key.includes("privateproximity") || key.includes("prossimitaprivati") || key.includes("consultazioneprossimita")) return "privateProximity2025";
  if (key.includes("prossimita") || key.includes("proximity") || key.includes("giugno") || key.includes("june2025")) return "proximity2025";
  if (key.includes("mappatura2021") || key.includes("fiss2021") || key.includes("wiredregioni")) return "fixedSurvey2021";
  if (key.includes("pi1g") || key.includes("mapp707k")) return "pi1g2025";
  return "";
}

export async function parseUploadedFiles(files, options = {}) {
  const imported = { datasets: {}, messages: [] };

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      imported.messages.push(file.name + " · file troppo grande (limite 200 MB).");
      continue;
    }

    try {
      const fileHint = datasetHintFromFilename(file.name);
      let parsed = [];
      if (/\.zip$/i.test(file.name)) {
        parsed = await readArchiveBuffer(await file.arrayBuffer(), file.name, fileHint, "", options);
      } else if (/\.(csv|txt)$/i.test(file.name)) {
        const dataset = parseDataset(decodeBuffer(await file.arrayBuffer()), file.name, fileHint, options);
        if (dataset) parsed.push(dataset);
      } else {
        imported.messages.push(file.name + " · formato non supportato.");
        continue;
      }

      if (!parsed.length) {
        imported.messages.push(file.name + " · intestazioni non riconosciute. Il file deve contenere un identificativo EGON e una struttura di dataset supportata.");
        continue;
      }

      for (const dataset of parsed) {
        const key = dataset.id;
        if (!imported.datasets[key]) imported.datasets[key] = [];
        for (const record of dataset.records) imported.datasets[key].push(record);
        imported.messages.push(
          DATASET_DEFINITIONS[key].label + " · "
          + dataset.records.length.toLocaleString("it-IT")
          + " record · " + dataset.name
        );
      }
    } catch (error) {
      imported.messages.push(file.name + " · " + (error.message || "errore durante la lettura."));
    }
  }

  return imported;
}
