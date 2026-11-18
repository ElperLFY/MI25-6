import {
  DATASET_DEFINITIONS,
  DOTS,
  EXTRA_DATASET_KEYS,
  FIELD_ALIASES,
  decodeFixedSurvey2021Color,
  decodeFixedSurvey2021Speed
} from "./datasets.js";

export {
  DATASET_DEFINITIONS,
  DOTS,
  EXTRA_DATASET_KEYS,
  decodeFixedSurvey2021Color,
  decodeFixedSurvey2021Speed
};

export const REGIONS = [
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
];

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
const HEADER_SCAN_LIMIT = 100;
const HEADER_SAMPLE_SIZE = 512 * 1024;
const archiveBytesCache = new Map();
const ARCHIVE_CACHE_DB_NAME = "mi25-6-archive-cache";
const ARCHIVE_CACHE_DB_VERSION = 1;
const ARCHIVE_CACHE_STORE = "archives";
const ARCHIVE_CACHE_FORMAT_VERSION = 1;
const ARCHIVE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
let archiveCacheDatabasePromise = null;
let archiveCacheGeneration = 0;

function archiveCacheKey(path) {
  return "v" + ARCHIVE_CACHE_FORMAT_VERSION + ":" + path;
}

function openArchiveCacheDatabase() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!archiveCacheDatabasePromise) {
    archiveCacheDatabasePromise = new Promise((resolve) => {
      let request;
      try {
        request = indexedDB.open(ARCHIVE_CACHE_DB_NAME, ARCHIVE_CACHE_DB_VERSION);
      } catch {
        resolve(null);
        return;
      }

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ARCHIVE_CACHE_STORE)) {
          database.createObjectStore(ARCHIVE_CACHE_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          archiveCacheDatabasePromise = null;
        };
        resolve(database);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }
  return archiveCacheDatabasePromise;
}

async function readPersistentArchive(path) {
  const database = await openArchiveCacheDatabase();
  if (!database) return null;

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(ARCHIVE_CACHE_STORE, "readonly");
      const request = transaction.objectStore(ARCHIVE_CACHE_STORE).get(archiveCacheKey(path));
      request.onsuccess = () => {
        const entry = request.result;
        if (!entry || !(entry.buffer instanceof ArrayBuffer)) {
          resolve(null);
          return;
        }
        if (!Number.isFinite(entry.cachedAt) || Date.now() - entry.cachedAt > ARCHIVE_CACHE_MAX_AGE_MS) {
          try {
            database.transaction(ARCHIVE_CACHE_STORE, "readwrite")
              .objectStore(ARCHIVE_CACHE_STORE)
              .delete(archiveCacheKey(path));
          } catch {
            // A stale entry is ignored even when the browser refuses its deletion.
          }
          resolve(null);
          return;
        }
        resolve(entry.buffer);
      };
      request.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writePersistentArchive(path, buffer, generation) {
  const database = await openArchiveCacheDatabase();
  if (!database || generation !== archiveCacheGeneration) return false;

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(ARCHIVE_CACHE_STORE, "readwrite");
      transaction.objectStore(ARCHIVE_CACHE_STORE).put({
        key: archiveCacheKey(path),
        cachedAt: Date.now(),
        buffer: buffer.slice(0)
      });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      // Quota and private-browsing restrictions must never prevent data loading.
      resolve(false);
    }
  });
}

export async function clearArchiveCache() {
  archiveCacheGeneration += 1;
  archiveBytesCache.clear();
  const database = await openArchiveCacheDatabase();
  if (!database) return false;

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(ARCHIVE_CACHE_STORE, "readwrite");
      transaction.objectStore(ARCHIVE_CACHE_STORE).clear();
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

const FIELD_HEADER_KEYS = new Set(Object.values(FIELD_ALIASES).flat());

export function normalise(value) {
  return String(value ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function headerKey(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function decodeBuffer(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function parseDelimitedRows(text, delimiter, onRow) {
  let row = [];
  let value = "";
  let quoted = false;
  let stopped = false;

  const emitRow = () => {
    row.push(value);
    let hasContent = false;
    for (let index = 0; index < row.length; index += 1) {
      if (row[index].trim() !== "") {
        hasContent = true;
        break;
      }
    }

    if (hasContent && onRow(row) === false) stopped = true;
    row = [];
    value = "";
  };

  for (let index = 0; index < text.length && !stopped; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"' && value.trim() === "") {
      quoted = true;
    } else if (character === delimiter) {
      row.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      emitRow();
    } else {
      value += character;
    }
  }

  if (!stopped && (value.length || row.length)) emitRow();
}

function hasIdentifierHeader(row) {
  const keys = row.map(headerKey);
  return FIELD_ALIASES.id.some((alias) => keys.includes(alias));
}

function findHeader(text) {
  const sample = text.slice(0, Math.min(text.length, HEADER_SAMPLE_SIZE));
  let best = null;

  for (const delimiter of [";", "\t", ","]) {
    let rowIndex = 0;
    parseDelimitedRows(sample, delimiter, (row) => {
      if (hasIdentifierHeader(row)) {
        const candidate = { delimiter, headerRowIndex: rowIndex, headers: row };
        if (!best || candidate.headers.length > best.headers.length) best = candidate;
        return false;
      }
      rowIndex += 1;
      return rowIndex < HEADER_SCAN_LIMIT;
    });
  }

  return best;
}

function findColumn(headers, aliases) {
  for (let index = 0; index < headers.length; index += 1) {
    if (aliases.includes(headers[index])) return index;
  }
  return -1;
}

function getColumns(headers) {
  const columns = {};

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    columns[field] = findColumn(headers, aliases);
  }

  columns.openFiberDeclared2024 = headers.findIndex((header) =>
    header.startsWith("civicodichiaratocopertodaoperatoriprivati")
    || header.includes("mappaturacivicidiprossimita2024")
  );

  if (columns.id < 0) return null;
  return columns;
}

function inferDatasetType(headers, name, forcedType = "") {
  const filename = headerKey(name);
  const has = (key) => headers.includes(key);
  const privateCoverageHeader = headers.some((header) =>
    header.startsWith("civicodichiaratocopertodaoperatoriprivati")
    || header.includes("mappaturacivicidiprossimita2024")
  );
  const hasJuneCoverage = has("copertoagiugno2025")
    || has("copertoagiugno")
    || has("statogiugno25");
  const hasEligibility = has("ammissibilesino") || has("ammissibile");
  const hasExclusion = has("causeesclusione") || has("causaesclusione");
  const has2021Coverage = has("colore26") || has("peakveldown26") || has("velmaxdown26");

  if (has("caratteristica")) return "general2025";
  if (has2021Coverage || filename.includes("mappatura2021") || filename.includes("fiss2021") || filename.includes("wiredregioni")) {
    return "fixedSurvey2021";
  }
  if (filename.includes("fibercop") || filename.includes("fcop") || forcedType === "fiberCopProximity2025") {
    return "fiberCopProximity2025";
  }
  if (privateCoverageHeader || hasJuneCoverage || forcedType === "proximity2025") {
    return "proximity2025";
  }
  if (hasEligibility && hasExclusion) return "fiberCopProximity2025";
  if (filename.includes("pi1g") || filename.includes("mapp707k") || forcedType === "pi1g2025") {
    return "pi1g2025";
  }
  if (forcedType && DATASET_DEFINITIONS[forcedType]) return forcedType;
  return "";
}

function createStringInterner() {
  const values = new Map();
  return (value) => {
    const text = String(value ?? "");
    if (!values.has(text)) values.set(text, text);
    return values.get(text);
  };
}

function createNormaliseCache() {
  const values = new Map();
  return (value) => {
    const text = String(value ?? "");
    if (!values.has(text)) values.set(text, normalise(text));
    return values.get(text);
  };
}

function readValue(row, index) {
  return index >= 0 ? String(row[index] ?? "").trim() : "";
}

function isEgonValue(value) {
  return /^\d{8,20}$/.test(String(value ?? "").trim());
}

function alignRow(row, headers, idColumn) {
  if (row.length <= headers.length) return row;

  const extraColumns = row.length - headers.length;
  for (let offset = 0; offset <= extraColumns; offset += 1) {
    if (isEgonValue(row[idColumn + offset])) return row.slice(offset, offset + headers.length);
  }

  if (headers[0] === "" || headers[0].startsWith("unnamed")) return row.slice(0, headers.length);
  return row.slice(0, headers.length);
}

function matchesRow(row, columns, query) {
  const region = normalise(readValue(row, columns.region));
  const province = normalise(readValue(row, columns.province));
  const city = normalise(readValue(row, columns.city));
  const street = normalise(readValue(row, columns.street));
  const fullAddress = normalise(readValue(row, columns.fullAddress));
  const number = normalise(readValue(row, columns.number));
  const suffix = normalise(readValue(row, columns.suffix));

  if (query.region && region && !region.startsWith(query.region)) return false;
  if (query.province && !province.includes(query.province)) return false;
  if (query.city && !city.includes(query.city)) return false;
  if (query.street && !street.includes(query.street) && !fullAddress.includes(query.street)) return false;
  if (query.number) {
    const fullNumber = suffix ? normalise(number + " " + suffix) : number;
    const numberMatches = number === query.number
      || fullNumber === query.number
      || (query.number === "SNC" && ["", "0"].includes(number))
      || (!number && fullAddress.includes(query.number));
    if (!numberMatches) return false;
  }
  return true;
}

function makeRecord(row, originalHeaders, headers, columns, datasetId, intern, cachedNormalise, options = {}, sourceFile = "", sourceRowNumber = 0) {
  const id = intern(readValue(row, columns.id));
  const fullAddress = intern(readValue(row, columns.fullAddress));
  const streetValue = readValue(row, columns.street) || fullAddress;
  const record = {
    id,
    characteristic: intern(readValue(row, columns.characteristic).toUpperCase()),
    region: intern(readValue(row, columns.region)),
    province: intern(readValue(row, columns.province)),
    city: intern(readValue(row, columns.city)),
    district: intern(readValue(row, columns.district)),
    procom: intern(readValue(row, columns.procom)),
    street: intern(streetValue),
    fullAddress,
    number: intern(readValue(row, columns.number)),
    suffix: intern(readValue(row, columns.suffix)),
    km: readValue(row, columns.km),
    latitude: readValue(row, columns.latitude),
    longitude: readValue(row, columns.longitude),
    operator: readValue(row, columns.operator),
    nga: readValue(row, columns.nga),
    technology: readValue(row, columns.technology),
    maxDownload: readValue(row, columns.maxDownload),
    maxUpload: readValue(row, columns.maxUpload),
    peakDownload: readValue(row, columns.peakDownload),
    peakUpload: readValue(row, columns.peakUpload),
    vhcnClass: readValue(row, columns.vhcnClass),
    coverageYear: readValue(row, columns.coverageYear),
    publicIntervention: readValue(row, columns.publicIntervention),
    numUiPassed: readValue(row, columns.numUiPassed),
    gridId: readValue(row, columns.gridId),
    gridCivQuality: readValue(row, columns.gridCivQuality),
    publicPlan: readValue(row, columns.publicPlan),
    proximityCiv: readValue(row, columns.proximityCiv),
    openFiberDeclared2024: readValue(row, columns.openFiberDeclared2024),
    coveredJune2025: readValue(row, columns.coveredJune2025),
    technologyJune2025: readValue(row, columns.technologyJune2025),
    eligibility: readValue(row, columns.eligibility),
    exclusionReason: readValue(row, columns.exclusionReason),
    networkColor2026: readValue(row, columns.networkColor2026),
    networkColor2026Present: columns.networkColor2026 >= 0,
    peakDownload2026: readValue(row, columns.peakDownload2026),
    maxDownload2026: readValue(row, columns.maxDownload2026),
    sourceRow: readValue(row, columns.sourceRow),
    municipalityCode: readValue(row, columns.municipalityCode),
    sectionCode: readValue(row, columns.sectionCode),
    isPro: readValue(row, columns.isPro),
    technologyTime: readValue(row, columns.technologyTime),
    declaredPrivateCoverage: readValue(row, columns.declaredPrivateCoverage),
    coverageStatusJune2025: readValue(row, columns.coverageStatusJune2025),
    technologyStatusJune2025: readValue(row, columns.technologyStatusJune2025),
    exclusionCause: readValue(row, columns.exclusionCause),
    datasetId
  };

  if (!record.id && !record.street && !record.city && !record.fullAddress) return null;

  const extraFields = [];
  for (let index = 0; index < headers.length; index += 1) {
    const value = String(row[index] ?? "").trim();
    if (!value) continue;
    if (!FIELD_HEADER_KEYS.has(headers[index]) && index !== columns.openFiberDeclared2024) {
      extraFields.push({ name: originalHeaders[index] || headers[index], value });
    }
  }
  record.extraFields = extraFields;
  if (options.includeSourceFields) {
    record.sourceFields = originalHeaders.map((name, index) => ({
      name,
      value: String(row[index] ?? "").trim()
    }));
    record.sourceFile = sourceFile;
    record.sourceRowNumber = sourceRowNumber;
  }

  record.normalisedRegion = cachedNormalise(record.region);
  record.normalisedProvince = cachedNormalise(record.province);
  record.normalisedCity = cachedNormalise(record.city);
  record.normalisedStreet = cachedNormalise(record.street);
  record.normalisedFullAddress = cachedNormalise(record.fullAddress);
  record.normalisedNumber = cachedNormalise(record.number);
  record.normalisedSuffix = cachedNormalise(record.suffix);
  record.normalisedFullNumber = record.normalisedSuffix
    ? cachedNormalise(record.number + " " + record.suffix)
    : record.normalisedNumber;

  const addressParts = [
    record.normalisedRegion,
    record.normalisedProvince,
    record.normalisedCity,
    cachedNormalise(record.district),
    record.normalisedStreet,
    record.normalisedFullAddress,
    record.normalisedNumber,
    record.normalisedSuffix
  ];
  record.key = record.id ? "EGON:" + record.id : "ADDRESS:" + addressParts.join("|");
  return record;
}

export function parseDataset(text, name = "dataset", forcedType = "", options = {}) {
  const cleanText = String(text ?? "").replace(/^\uFEFF/, "");
  const headerInfo = findHeader(cleanText);
  if (!headerInfo) return null;

  let originalHeaders = [];
  let headers = [];
  let columns = null;
  let datasetId = "";
  let rowIndex = 0;
  let headerFound = false;
  let readerHeaders = null;
  let readerOffset = 0;
  const records = [];
  const intern = createStringInterner();
  const cachedNormalise = createNormaliseCache();

  parseDelimitedRows(cleanText, headerInfo.delimiter, (row) => {
    if (rowIndex < headerInfo.headerRowIndex) {
      rowIndex += 1;
      return;
    }

    if (!headerFound) {
      originalHeaders = row.map((value) => String(value ?? "").replace(/^\uFEFF/, "").trim());
      headers = originalHeaders.map(headerKey);
      columns = getColumns(headers);
      if (!columns) return;
      datasetId = inferDatasetType(headers, name, forcedType);
      if (!datasetId) return;
      headerFound = true;
      rowIndex += 1;
      return;
    }

    const fields = options.readerMode ? row : alignRow(row, headers, columns.id);
    if (options.query && !matchesRow(fields, columns, options.query)) {
      rowIndex += 1;
      return;
    }
    if (options.readerMode) {
      // Keep the original row and one shared header array; avoid building the
      // normalized 50-field record model for millions of rows in CSV Reader.
      if (!readerHeaders) {
        const egonIndex = fields.findIndex(isEgonValue);
        readerOffset = egonIndex >= 0 ? Math.max(0, egonIndex - columns.id) : 0;
        readerHeaders = originalHeaders.slice();
        if (readerOffset) {
          readerHeaders.unshift(...Array.from({ length: readerOffset }, (_, index) =>
            index === 0 ? "Indice sorgente" : "Colonna iniziale " + (index + 1)
          ));
        }
        while (readerHeaders.length < fields.length) {
          readerHeaders.push("Colonna aggiuntiva " + (readerHeaders.length + 1));
        }
      } else {
        while (readerHeaders.length < fields.length) {
          readerHeaders.push("Colonna aggiuntiva " + (readerHeaders.length + 1));
        }
      }
      records.push({
        datasetId,
        sourceHeaders: readerHeaders,
        sourceValues: fields,
        sourceFile: name,
        sourceRowNumber: rowIndex + 1,
        normalisedRegion: cachedNormalise(readValue(fields, columns.region + readerOffset))
      });
      rowIndex += 1;
      return;
    }

    const record = makeRecord(
      fields,
      originalHeaders,
      headers,
      columns,
      datasetId,
      intern,
      cachedNormalise,
      options,
      name,
      rowIndex + 1
    );
    if (record) records.push(record);
    rowIndex += 1;
  });

  if (!headerFound) return null;
  return { id: datasetId, records, name };
}

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
    const nestedBuffer = await entry.async("arraybuffer");
    const nestedArchive = await window.JSZip.loadAsync(nestedBuffer);
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
    const content = decodeBuffer(await entry.async("arraybuffer"));
    const dataset = parseDataset(content, entry.name || name, archiveType, options);
    if (dataset) parsed.push(dataset);
  }

  return parsed;
}

async function readArchiveBuffer(buffer, name, forcedType = "", region = "", options = {}) {
  if (!window.JSZip) throw new Error("La libreria JSZip non è disponibile.");
  const archive = await window.JSZip.loadAsync(buffer);
  const parsed = await readArchiveEntries(archive, name, forcedType, region, { expandedBytes: 0 }, 0, options);

  if (!parsed.length) {
    throw new Error("Nell’archivio non è stato trovato un CSV riconoscibile. Controlla che italia.zip contenga ZIP regionali (ad esempio SICILIA.zip) e che questi contengano CSV con intestazioni supportate.");
  }
  return parsed;
}
async function getArchiveBytes(path) {
  if (!archiveBytesCache.has(path)) {
    const generation = archiveCacheGeneration;
    const task = (async () => {
      const cached = await readPersistentArchive(path);
      if (cached) return cached;

      // Revalidate a missed browser HTTP-cache entry; IndexedDB is the durable cache.
      const response = await fetch(path, { cache: "no-cache" });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("HTTP " + response.status + " durante il caricamento di " + path);

      const buffer = await response.arrayBuffer();
      await writePersistentArchive(path, buffer, generation);
      return buffer;
    })();
    archiveBytesCache.set(path, task);
    task.catch(() => archiveBytesCache.delete(path));
  }
  return archiveBytesCache.get(path);
}

async function fetchArchive(paths, forcedType = "", region = "", options = {}) {
  let lastError = null;
  for (const path of paths) {
    try {
      const buffer = await getArchiveBytes(path);
      if (!buffer) {
        archiveBytesCache.delete(path);
        continue;
      }
      return await readArchiveBuffer(buffer, path, forcedType, region, options);
    } catch (error) {
      lastError = error;
      archiveBytesCache.delete(path);
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
  if (!filename) return { records: [], available: false };

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

  const parseOptions = { query: options.query, includeSourceFields: options.includeSourceFields === true, readerMode: options.readerMode === true };
  const generalPromise = loadGeneral ? readGeneralRegion(region, parseOptions) : Promise.resolve(null);
  const pi1gPromise = loadPi1g
    ? readPi1gRegion(region, parseOptions)
    : Promise.resolve({ records: null, available: false });
  const extrasPromise = Promise.all(requestedExtras.map(async (key) => {
    try {
      return [key, await readOptionalRegionalDataset(key, region, parseOptions)];
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
    extraErrors
  };
}

function datasetHintFromFilename(filename) {
  const key = headerKey(filename);
  if (key.includes("fibercop") || key.includes("fcop")) return "fiberCopProximity2025";
  if (key.includes("prossimita") || key.includes("proximity") || key.includes("openfiber") || key.includes("giugno") || key.includes("june2025")) return "proximity2025";
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

function matches(record, query) {
  if (query.region && !record.normalisedRegion.startsWith(query.region)) return false;
  if (query.province && !record.normalisedProvince.includes(query.province)) return false;
  if (query.city && !record.normalisedCity.includes(query.city)) return false;
  if (query.street
    && !record.normalisedStreet.includes(query.street)
    && !record.normalisedFullAddress.includes(query.street)) return false;

  if (query.number) {
    const numberMatches = record.normalisedNumber === query.number
      || record.normalisedFullNumber === query.number
      || (query.number === "SNC" && ["", "0"].includes(record.normalisedNumber))
      || (!record.normalisedNumber && record.normalisedFullAddress.includes(query.number));
    if (!numberMatches) return false;
  }

  return true;
}

function getResult(results, record) {
  let result = results.get(record.key);
  if (!result) {
    result = { id: record.id, general: null, pi1g: null, datasets: {} };
    results.set(record.key, result);
  }
  return result;
}

export function searchRecords(general, pi1g, extra, query) {
  const results = new Map();

  for (const record of general) {
    if (matches(record, query)) getResult(results, record).general = record;
  }
  for (const record of pi1g) {
    if (matches(record, query)) getResult(results, record).pi1g = record;
  }
  for (const [key, records] of Object.entries(extra || {})) {
    for (const record of records) {
      if (!matches(record, query)) continue;
      const result = getResult(results, record);
      if (!result.datasets[key]) result.datasets[key] = [];
      result.datasets[key].push(record);
    }
  }

  return Array.from(results.values());
}

export function collectRecords(general, pi1g, extra) {
  const records = [];
  for (const record of general) records.push(record);
  for (const record of pi1g) records.push(record);
  for (const values of Object.values(extra || {})) {
    for (const record of values) records.push(record);
  }
  return records;
}

export function cityIsKnown(general, pi1g, extra, city, region = "") {
  const query = normalise(city);
  const selectedRegion = normalise(region);
  const lists = [general, pi1g];
  for (const records of Object.values(extra || {})) lists.push(records);

  for (const records of lists) {
    for (const record of records) {
      if (record.normalisedCity.includes(query)
        && (!selectedRegion || record.normalisedRegion.startsWith(selectedRegion))) return true;
    }
  }
  return false;
}

export function getSuggestions(field, search, state, records) {
  const query = normalise(search);
  const values = new Set();
  const fieldNames = { province: "province", city: "city", street: "street" };
  const selected = {
    region: normalise(state.region),
    province: field === "province" ? "" : normalise(state.province),
    city: field === "city" ? "" : normalise(state.city),
    street: field === "street" ? "" : normalise(state.street)
  };

  for (const record of records) {
    if (selected.region && !record.normalisedRegion.startsWith(selected.region)) continue;
    if (selected.province && !record.normalisedProvince.includes(selected.province)) continue;
    if (selected.city && !record.normalisedCity.includes(selected.city)) continue;
    if (selected.street && !record.normalisedStreet.includes(selected.street)) continue;

    let value = "";
    if (field === "number") {
      value = !record.normalisedNumber || record.normalisedNumber === "0"
        ? "SNC"
        : record.number + (record.suffix ? "/" + record.suffix : "");
    } else {
      value = record[fieldNames[field]] ?? "";
    }

    if (!value) continue;
    const normalisedValue = normalise(value);
    if (query && !normalisedValue.startsWith(query) && !normalisedValue.includes(" " + query)) continue;
    values.add(value);
  }

  return Array.from(values).sort((first, second) => {
    const firstNumber = Number.parseInt(first, 10);
    const secondNumber = Number.parseInt(second, 10);
    if (Number.isNaN(firstNumber) || Number.isNaN(secondNumber) || firstNumber === secondNumber) {
      return first.localeCompare(second, "it");
    }
    return firstNumber - secondNumber;
  });
}
