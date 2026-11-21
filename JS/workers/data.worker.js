import "../../vendor/jszip.min.js";
import { nowMs, recordTiming } from "../data/diagnostics.js";
import { getReaderPage } from "../data/reader-table.js?v=1.3.000";
import {
  addCityIndexRecords,
  buildCityIndex,
  cityIsKnown,
  clearArchiveCache,
  getSuggestions,
  loadRegionalData,
  normalise,
  parseUploadedFiles,
  searchRecords,
  DATASET_DEFINITIONS,
  EXTRA_DATASET_KEYS
} from "../data/index.js?v=1.3.000";

const emptyExtra = () => Object.fromEntries(EXTRA_DATASET_KEYS.map((key) => [key, []]));
const store = {
  region: "",
  automatic: { general: [], pi1g: [], extra: emptyExtra(), pi1gAvailable: false, extraAvailable: {} },
  manual: { general: [], pi1g: [], extra: emptyExtra() },
  readerDataset: "",
  readerRecords: [],
  readerTable: null,
  readerGeneration: 0,
  suggestionCache: new Map(),
  cityIndex: null
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

function rebuildCityIndex() {
  const startedAt = nowMs();
  const data = mergedDatasets();
  store.cityIndex = buildCityIndex(data.general, data.pi1g, data.extra);
  return nowMs() - startedAt;
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

async function loadReaderDataset({ region, dataset, baseUrl }) {
  if (!region) return { count: 0, available: false, error: "Seleziona una Regione prima di aprire il CSV Reader." };
  if (!DATASET_DEFINITIONS[dataset]) return { count: 0, available: false, error: "Dataset non riconosciuto." };

  const generation = ++store.readerGeneration;
  store.readerDataset = "";
  store.readerRecords = [];
  store.readerTable = null;

  const manualRecords = dataset === "general2025"
    ? store.manual.general
    : dataset === "pi1g2025"
      ? store.manual.pi1g
      : store.manual.extra[dataset];

  if (manualRecords.length) {
    if (manualRecords.every((record) => Array.isArray(record.sourceFields))) {
      if (generation !== store.readerGeneration) return { count: 0, available: true, cancelled: true };
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
    shouldCancel: () => generation !== store.readerGeneration,
    baseUrl: baseUrl || self.location.href
  });

  if (generation !== store.readerGeneration) return { count: 0, available: true, cancelled: true };

  const readerData = dataset === "general2025"
    ? loaded.general
    : dataset === "pi1g2025"
      ? loaded.pi1g
      : loaded.extra[dataset];

  if (readerData?.readerMode === true) {
    store.readerTable = readerData;
    store.readerRecords = [];
  } else {
    store.readerTable = null;
    store.readerRecords = Array.isArray(readerData) ? readerData : [];
  }
  store.readerDataset = dataset;

  const available = dataset === "general2025"
    ? true
    : dataset === "pi1g2025"
      ? loaded.hasPi1gArchive
      : loaded.extraAvailable[dataset] === true;
  const count = store.readerTable?.count ?? store.readerRecords.length;
  return { count, available };
}

async function dispatch(type, payload = {}) {
  switch (type) {
    case "LOAD_REGION": {
      const workerLoadStartedAt = nowMs();
      const region = String(payload.region || "").trim();
      if (store.region !== region) {
        store.readerGeneration += 1;
        store.readerDataset = "";
        store.readerRecords = [];
        store.readerTable = null;
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
        store.cityIndex = null;
        store.suggestionCache.clear();
      }

      const requestedExtras = payload.options?.loadExtras || EXTRA_DATASET_KEYS;
      const isMainRegionalReload = payload.options?.loadGeneral !== false
        || payload.options?.loadPi1g !== false;
      if (isMainRegionalReload && !requestedExtras.includes("fixedSurvey2021")) {
        store.automatic.extra.fixedSurvey2021 = [];
        delete store.automatic.extraAvailable.fixedSurvey2021;
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
      const indexStartedAt = nowMs();
      const additional2021Only = payload.options?.loadGeneral === false
        && payload.options?.loadPi1g === false
        && payload.options?.loadExtras?.length === 1
        && payload.options.loadExtras[0] === "fixedSurvey2021"
        && store.cityIndex instanceof Map;
      if (additional2021Only) {
        addCityIndexRecords(store.cityIndex, store.automatic.extra.fixedSurvey2021 || [], "fixedSurvey2021");
      } else {
        rebuildCityIndex();
      }
      const indexDuration = nowMs() - indexStartedAt;
      const counts = getCounts();
      if (loaded.timings) {
        recordTiming({ timings: loaded.timings.stages, datasetKey: "worker" }, "Indice città", indexStartedAt, { records: counts.general + counts.pi1g + Object.values(counts.extra).reduce((sum, count) => sum + count, 0) });
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
      return searchRecords(data.general, data.pi1g, data.extra, payload.query || {}, store.cityIndex);
    }

    case "GET_SUGGESTIONS": {
      const data = mergedDatasets();
      return getSuggestions(payload.field, payload.search, payload.state || {}, getRecordGroups(data), store.suggestionCache, store.cityIndex);
    }

    case "FIND_CITY": {
      const city = normalise(payload.city);
      const data = mergedDatasets();
      const bucket = store.cityIndex?.get(city);
      return bucket
        ? findInRecordGroups([bucket.general, bucket.pi1g, ...Object.values(bucket.extra)], () => true)
        : findInRecordGroups(getRecordGroups(data), (record) => record.normalisedCity === city);
    }

    case "CITY_IS_KNOWN": {
      const data = mergedDatasets();
      return cityIsKnown(data.general, data.pi1g, data.extra, payload.city, payload.region || "", store.cityIndex);
    }

    case "PARSE_UPLOAD": {
      const imported = await parseUploadedFiles(payload.files || [], payload.options || {});
      for (const [key, records] of Object.entries(imported.datasets)) {
        if (key === "general2025") store.manual.general.push(...records);
        else if (key === "pi1g2025") store.manual.pi1g.push(...records);
        else if (EXTRA_DATASET_KEYS.includes(key)) store.manual.extra[key].push(...records);
      }
      store.suggestionCache.clear();
      rebuildCityIndex();
      const counts = Object.fromEntries(Object.entries(imported.datasets).map(([key, records]) => [key, records.length]));
      return { messages: imported.messages, counts, summary: getCounts() };
    }

    case "CLEAR_MANUAL": {
      store.readerGeneration += 1;
      store.readerDataset = "";
      store.readerRecords = [];
      store.readerTable = null;
      store.manual = { general: [], pi1g: [], extra: emptyExtra() };
      store.readerDataset = "";
      store.readerRecords = [];
      store.suggestionCache.clear();
      rebuildCityIndex();
      return getCounts();
    }

    case "LOAD_READER":
      return loadReaderDataset(payload);

    case "GET_READER_PAGE":
      return getReaderPage({
        ...payload,
        table: store.readerTable,
        records: store.readerRecords
      });

    case "RELEASE_READER":
      store.readerGeneration += 1;
      store.readerDataset = "";
      store.readerRecords = [];
      store.readerTable = null;
      return true;

    case "CLEAR_ARCHIVE_CACHE": {
      store.readerGeneration += 1;
      store.readerDataset = "";
      store.readerRecords = [];
      store.readerTable = null;
      const result = await clearArchiveCache();
      if (result.persistentAvailable && !result.persistentCleared) return result;

      store.region = "";
      store.automatic = {
        general: [],
        pi1g: [],
        extra: emptyExtra(),
        pi1gAvailable: false,
        extraAvailable: {}
      };
      store.readerDataset = "";
      store.readerRecords = [];
      store.suggestionCache.clear();
      rebuildCityIndex();
      return result;
    }

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
