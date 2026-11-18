import "../../vendor/jszip.min.js";
import { nowMs, recordTiming } from "../data/diagnostics.js";
import {
  cityIsKnown,
  clearArchiveCache,
  getSuggestions,
  loadRegionalData,
  normalise,
  parseUploadedFiles,
  searchRecords,
  DATASET_DEFINITIONS,
  EXTRA_DATASET_KEYS
} from "../data/index.js";

const emptyExtra = () => Object.fromEntries(EXTRA_DATASET_KEYS.map((key) => [key, []]));
const store = {
  region: "",
  automatic: { general: [], pi1g: [], extra: emptyExtra(), pi1gAvailable: false, extraAvailable: {} },
  manual: { general: [], pi1g: [], extra: emptyExtra() },
  readerDataset: "",
  readerRecords: [],
  suggestionCache: new Map()
};

function mergedDatasets() {
  const extra = {};
  for (const key of EXTRA_DATASET_KEYS) {
    extra[key] = store.manual.extra[key].length
      ? store.manual.extra[key]
      : store.automatic.extra[key] || [];
  }
  return {
    general: store.manual.general.length ? store.manual.general : store.automatic.general,
    pi1g: store.manual.pi1g.length ? store.manual.pi1g : store.automatic.pi1g,
    extra
  };
}

function getRecordGroups(data) {
  return [data.general, data.pi1g, ...Object.values(data.extra)];
}

function findInRecordGroups(groups, predicate) {
  for (const records of groups) {
    for (const record of records) {
      if (predicate(record)) return record;
    }
  }
  return null;
}

function getCounts() {
  const merged = mergedDatasets();
  const extra = Object.fromEntries(EXTRA_DATASET_KEYS.map((key) => [key, merged.extra[key].length]));
  const manual = {
    general: store.manual.general.length,
    pi1g: store.manual.pi1g.length,
    extra: Object.fromEntries(EXTRA_DATASET_KEYS.map((key) => [key, store.manual.extra[key].length]))
  };
  return {
    general: merged.general.length,
    pi1g: merged.pi1g.length,
    extra,
    manual,
    pi1gAvailable: store.automatic.pi1gAvailable || manual.pi1g > 0,
    extraAvailable: store.automatic.extraAvailable
  };
}

function readerHeaders(record) {
  return Array.isArray(record.sourceHeaders)
    ? record.sourceHeaders
    : (record.sourceFields || []).map((field) => field.name);
}

function readerValues(record) {
  return Array.isArray(record.sourceValues)
    ? record.sourceValues
    : (record.sourceFields || []).map((field) => field.value);
}

function getReaderColumns(records) {
  const columns = [];
  const seenColumns = new Set();
  const seenFiles = new Set();
  for (const record of records) {
    const sourceFile = record.sourceFile || "CSV";
    if (seenFiles.has(sourceFile)) continue;
    seenFiles.add(sourceFile);
    const occurrences = new Map();
    for (const rawName of readerHeaders(record)) {
      const label = String(rawName ?? "").trim() || "Colonna senza nome";
      const occurrence = occurrences.get(label) || 0;
      occurrences.set(label, occurrence + 1);
      const key = label + "\u0000" + occurrence;
      if (!seenColumns.has(key)) {
        seenColumns.add(key);
        columns.push({ key, label });
      }
    }
  }
  return columns;
}

async function loadReaderDataset({ region, dataset, baseUrl }) {
  if (!region) return { count: 0, available: false, error: "Seleziona una Regione prima di aprire il CSV Reader." };
  if (!DATASET_DEFINITIONS[dataset]) return { count: 0, available: false, error: "Dataset non riconosciuto." };

  const manualRecords = dataset === "general2025"
    ? store.manual.general
    : dataset === "pi1g2025"
      ? store.manual.pi1g
      : store.manual.extra[dataset];

  if (manualRecords.length) {
    if (manualRecords.every((record) => Array.isArray(record.sourceFields))) {
      store.readerDataset = dataset;
      store.readerRecords = manualRecords;
      return { count: manualRecords.length, available: true, manual: true };
    }
    return {
      count: 0,
      available: true,
      manual: true,
      error: "Il file manuale era stato caricato prima del CSV Reader. Ricaricalo dopo aver attivato la modalità per conservare tutte le intestazioni originali."
    };
  }

  const loaded = await loadRegionalData(region, {
    loadGeneral: dataset === "general2025",
    loadPi1g: dataset === "pi1g2025",
    loadExtras: EXTRA_DATASET_KEYS.includes(dataset) ? [dataset] : [],
    readerMode: true,
    baseUrl: baseUrl || self.location.href
  });

  if (dataset === "general2025") store.readerRecords = loaded.general || [];
  else if (dataset === "pi1g2025") store.readerRecords = loaded.pi1g || [];
  else store.readerRecords = loaded.extra[dataset] || [];

  store.readerDataset = dataset;
  const available = dataset === "general2025"
    ? true
    : dataset === "pi1g2025"
      ? loaded.hasPi1gArchive
      : loaded.extraAvailable[dataset] === true;
  return { count: store.readerRecords.length, available };
}

function getReaderPage({ page = 0, pageSize = 100, query = "" }) {
  const records = store.readerRecords;
  const normalizedQuery = normalise(query);
  const filtered = normalizedQuery
    ? records.filter((record) => readerValues(record).some((value) => normalise(value).includes(normalizedQuery)))
    : records;
  const safePageSize = Math.max(1, Math.min(500, Number(pageSize) || 100));
  const totalPages = Math.max(1, Math.ceil(filtered.length / safePageSize));
  const safePage = Math.min(Math.max(0, Number(page) || 0), totalPages - 1);
  const start = safePage * safePageSize;
  return {
    columns: getReaderColumns(records),
    rows: filtered.slice(start, start + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    totalCount: records.length,
    filteredCount: filtered.length,
    totalPages
  };
}

async function dispatch(type, payload = {}) {
  switch (type) {
    case "LOAD_REGION": {
      const workerLoadStartedAt = nowMs();
      const region = String(payload.region || "").trim();
      if (store.region !== region) {
        store.region = region;
        store.automatic = {
          general: [],
          pi1g: [],
          extra: emptyExtra(),
          pi1gAvailable: false,
          extraAvailable: {}
        };
        store.readerDataset = "";
        store.readerRecords = [];
      }

      const loaded = await loadRegionalData(region, {
        ...payload.options,
        baseUrl: payload.baseUrl || self.__MI25_BASE_URL || self.location.href
      });
      if (payload.options?.loadGeneral !== false) store.automatic.general = loaded.general || [];
      if (payload.options?.loadPi1g !== false) store.automatic.pi1g = loaded.pi1g || [];
      if (payload.options?.loadPi1g !== false) store.automatic.pi1gAvailable = loaded.hasPi1gArchive === true;
      for (const key of payload.options?.loadExtras || EXTRA_DATASET_KEYS) {
        store.automatic.extra[key] = loaded.extra[key] || [];
        store.automatic.extraAvailable[key] = loaded.extraAvailable[key] === true;
      }
      const countStartedAt = nowMs();
      store.suggestionCache.clear();
      const counts = getCounts();
      if (loaded.timings) {
        recordTiming({ timings: loaded.timings.stages, datasetKey: "worker" }, "Aggiornamento stato e conteggi", countStartedAt);
        loaded.timings.totalMs = nowMs() - workerLoadStartedAt;
      }
      return {
        counts,
        extraErrors: loaded.extraErrors || {},
        hasPi1gArchive: counts.pi1gAvailable,
        timings: loaded.timings || null
      };
    }
    case "GET_COUNTS":
      return getCounts();

    case "SEARCH": {
      const data = mergedDatasets();
      return searchRecords(data.general, data.pi1g, data.extra, payload.query || {});
    }

    case "GET_SUGGESTIONS": {
      const data = mergedDatasets();
      return getSuggestions(payload.field, payload.search, payload.state || {}, getRecordGroups(data), store.suggestionCache);
    }

    case "FIND_CITY": {
      const city = normalise(payload.city);
      const data = mergedDatasets();
      return findInRecordGroups(getRecordGroups(data), (record) => record.normalisedCity === city);
    }

    case "CITY_IS_KNOWN": {
      const data = mergedDatasets();
      return cityIsKnown(getRecordGroups(data), [], {}, payload.city, payload.region || "");
    }

    case "PARSE_UPLOAD": {
      const imported = await parseUploadedFiles(payload.files || [], payload.options || {});
      for (const [key, records] of Object.entries(imported.datasets)) {
        if (key === "general2025") store.manual.general.push(...records);
        else if (key === "pi1g2025") store.manual.pi1g.push(...records);
        else if (EXTRA_DATASET_KEYS.includes(key)) store.manual.extra[key].push(...records);
      }
      store.suggestionCache.clear();
      const counts = Object.fromEntries(Object.entries(imported.datasets).map(([key, records]) => [key, records.length]));
      return { messages: imported.messages, counts, summary: getCounts() };
    }

    case "CLEAR_MANUAL": {
      store.manual = { general: [], pi1g: [], extra: emptyExtra() };
      store.readerDataset = "";
      store.readerRecords = [];
      store.suggestionCache.clear();
      return getCounts();
    }

    case "LOAD_READER":
      return loadReaderDataset(payload);

    case "GET_READER_PAGE":
      return getReaderPage(payload);

    case "RELEASE_READER":
      store.readerDataset = "";
      store.readerRecords = [];
      return true;

    case "CLEAR_ARCHIVE_CACHE":
      return clearArchiveCache();

    default:
      throw new Error("Comando worker sconosciuto: " + type);
  }
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {};
  try {
    const result = await dispatch(type, payload);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error?.message || String(error)
    });
  }
};
