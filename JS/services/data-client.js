const pendingRequests = new Map();
let nextRequestId = 1;

let dataWorker;
function getDataWorker() {
  if (typeof Worker === "undefined") {
    throw new Error("Questo browser non supporta Web Worker. Aggiorna il browser per elaborare gli archivi senza bloccare l'interfaccia.");
  }
  if (!dataWorker) {
    dataWorker = new Worker(new URL("../workers/data.worker.js?v=1.2.009", import.meta.url), {
      type: "module",
      name: "MI25-6 data engine"
    });
    dataWorker.addEventListener("message", (event) => {
      const { id, ok, result, error } = event.data || {};
      const pending = pendingRequests.get(id);
      if (!pending) return;
      pendingRequests.delete(id);
      if (ok) pending.resolve(result);
      else pending.reject(new Error(error || "Errore durante l'elaborazione dei dati."));
    });
    dataWorker.addEventListener("error", (event) => {
      const error = new Error(event.message || "Il Web Worker dei dati si è interrotto.");
      for (const pending of pendingRequests.values()) pending.reject(error);
      pendingRequests.clear();
      dataWorker?.terminate();
      dataWorker = null;
    });
    dataWorker.addEventListener("messageerror", () => {
      const error = new Error("Il browser non è riuscito a trasferire il risultato dal Web Worker.");
      for (const pending of pendingRequests.values()) pending.reject(error);
      pendingRequests.clear();
    });
  }
  return dataWorker;
}

function request(type, payload = {}) {
  const worker = getDataWorker();
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    try {
      worker.postMessage({ id, type, payload });
    } catch (error) {
      pendingRequests.delete(id);
      reject(error);
    }
  });
}

export const loadRegionalData = (region, options = {}) => request("LOAD_REGION", {
  region,
  options,
  baseUrl: document.baseURI
});
export const getDatasetCounts = () => request("GET_COUNTS");
export const searchRecords = (query) => request("SEARCH", { query });
export const getSuggestions = (field, search, state) => request("GET_SUGGESTIONS", { field, search, state });
export const findCityRecord = (city) => request("FIND_CITY", { city });
export const cityIsKnown = (city, region = "") => request("CITY_IS_KNOWN", { city, region });
export const parseUploadedFiles = (files, options = {}) => request("PARSE_UPLOAD", { files, options });
export const clearManualDatasets = () => request("CLEAR_MANUAL");
export const loadCsvReaderDataset = (region, dataset) => request("LOAD_READER", { region, dataset, baseUrl: document.baseURI });
export const getCsvReaderPage = (options = {}) => request("GET_READER_PAGE", options);
export const releaseCsvReader = () => request("RELEASE_READER");
export const clearArchiveCache = () => request("CLEAR_ARCHIVE_CACHE");
