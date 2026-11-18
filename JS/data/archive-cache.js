const archiveBytesCache = new Map();
const ARCHIVE_CACHE_DB_NAME = "mi25-6-archive-cache";
const ARCHIVE_CACHE_DB_VERSION = 2;
const ARCHIVE_CACHE_STORE = "archives";
const PARSED_DATASET_CACHE_STORE = "parsed-datasets";
const ARCHIVE_CACHE_FORMAT_VERSION = 1;
const PARSED_DATASET_CACHE_VERSION = 1;
const PARSED_DATASET_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PARSED_DATASET_CACHE_MAX_RECORDS = 850_000;
const PARSED_DATASET_CACHE_ESTIMATED_RECORD_BYTES = 256;
const PARSED_DATASET_CACHE_MAX_BYTES = 96 * 1024 * 1024;
const PARSED_DATASET_CACHE_TOTAL_LIMIT_BYTES = 192 * 1024 * 1024;
let parsedDatasetCacheGeneration = 0;
const ARCHIVE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function recordCacheTiming(options, stage, startedAt, details = {}) {
  if (!Array.isArray(options?.timings)) return;
  options.timings.push({
    dataset: options.datasetKey || "unknown",
    stage,
    durationMs: Math.max(0, nowMs() - startedAt),
    ...details
  });
}
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
      try { request = indexedDB.open(ARCHIVE_CACHE_DB_NAME, ARCHIVE_CACHE_DB_VERSION); }
      catch { resolve(null); return; }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ARCHIVE_CACHE_STORE)) database.createObjectStore(ARCHIVE_CACHE_STORE, { keyPath: "key" });
        if (!database.objectStoreNames.contains(PARSED_DATASET_CACHE_STORE)) database.createObjectStore(PARSED_DATASET_CACHE_STORE, { keyPath: "key" });
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); archiveCacheDatabasePromise = null; };
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
        if (!entry || !(entry.buffer instanceof ArrayBuffer)) { resolve(null); return; }
        if (!Number.isFinite(entry.cachedAt) || Date.now() - entry.cachedAt > ARCHIVE_CACHE_MAX_AGE_MS) {
          try { database.transaction(ARCHIVE_CACHE_STORE, "readwrite").objectStore(ARCHIVE_CACHE_STORE).delete(archiveCacheKey(path)); } catch {}
          resolve(null);
          return;
        }
        resolve(entry.buffer);
      };
      request.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function writePersistentArchive(path, buffer, generation) {
  const database = await openArchiveCacheDatabase();
  if (!database || generation !== archiveCacheGeneration) return false;
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(ARCHIVE_CACHE_STORE, "readwrite");
      transaction.objectStore(ARCHIVE_CACHE_STORE).put({ key: archiveCacheKey(path), cachedAt: Date.now(), buffer: buffer.slice(0) });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch { resolve(false); }
  });
}

function parsedDatasetCacheKey(path, region, dataset, entryName) {
  return "v" + PARSED_DATASET_CACHE_VERSION + ":"
    + [path, region, dataset, entryName].map((part) => String(part ?? "")).join("|");
}

export async function getParsedDatasetCache(path, region, dataset, entryName, options = {}) {
  if (options.readerMode || options.includeSourceFields || options.query) return null;
  const key = parsedDatasetCacheKey(path, region, dataset, entryName);
  const startedAt = nowMs();
  const database = await openArchiveCacheDatabase();
  if (!database) {
    recordCacheTiming(options, "Cache dati parsati", startedAt, { source: "IndexedDB", hit: false });
    return null;
  }

  const entry = await new Promise((resolve) => {
    try {
      const transaction = database.transaction(PARSED_DATASET_CACHE_STORE, "readonly");
      const request = transaction.objectStore(PARSED_DATASET_CACHE_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  const valid = entry
    && entry.dataset
    && Array.isArray(entry.dataset.records)
    && Number.isFinite(entry.cachedAt)
    && Date.now() - entry.cachedAt <= PARSED_DATASET_CACHE_MAX_AGE_MS;

  if (!valid && entry) {
    try {
      database.transaction(PARSED_DATASET_CACHE_STORE, "readwrite")
        .objectStore(PARSED_DATASET_CACHE_STORE).delete(key);
    } catch {}
  }

  recordCacheTiming(options, "Cache dati parsati", startedAt, {
    source: "IndexedDB",
    hit: Boolean(valid),
    records: valid ? entry.dataset.records.length : 0
  });
  return valid ? entry.dataset : null;
}

export async function putParsedDatasetCache(path, region, dataset, entryName, parsed, options = {}) {
  if (options.readerMode || options.includeSourceFields || options.query
    || !parsed || !Array.isArray(parsed.records) || !parsed.records.length) return false;

  const estimatedBytes = parsed.records.length * PARSED_DATASET_CACHE_ESTIMATED_RECORD_BYTES;
  if (parsed.records.length > PARSED_DATASET_CACHE_MAX_RECORDS || estimatedBytes > PARSED_DATASET_CACHE_MAX_BYTES) {
    recordCacheTiming(options, "Cache dati parsati", nowMs(), {
      source: "non memorizzato",
      records: parsed.records.length,
      reason: "limite di dimensione"
    });
    return false;
  }

  const key = parsedDatasetCacheKey(path, region, dataset, entryName);
  const generation = parsedDatasetCacheGeneration;
  const database = await openArchiveCacheDatabase();
  if (!database || generation !== parsedDatasetCacheGeneration) return false;

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(PARSED_DATASET_CACHE_STORE, "readwrite");
      const store = transaction.objectStore(PARSED_DATASET_CACHE_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        if (generation !== parsedDatasetCacheGeneration) {
          try { transaction.abort(); } catch {}
          resolve(false);
          return;
        }

        const entries = (request.result || []).sort((first, second) =>
          (first.cachedAt || 0) - (second.cachedAt || 0)
        );
        let totalBytes = entries.reduce((total, entry) =>
          total + (entry.key === key ? 0 : Number(entry.estimatedBytes) || 0), estimatedBytes
        );
        for (const entry of entries) {
          if (totalBytes <= PARSED_DATASET_CACHE_TOTAL_LIMIT_BYTES) break;
          if (entry.key === key) continue;
          store.delete(entry.key);
          totalBytes -= Number(entry.estimatedBytes) || 0;
        }

        store.put({
          key,
          cachedAt: Date.now(),
          estimatedBytes,
          dataset: parsed
        });
      };
      request.onerror = () => {
        try { transaction.abort(); } catch {}
        resolve(false);
      };
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

const DEFAULT_ARCHIVE_IDLE_TIMEOUT_MS = 30_000;

export async function getArchiveBytes(path, baseUrl = "", options = {}) {
  const requestUrl = baseUrl ? new URL(path, baseUrl).href : path;
  if (archiveBytesCache.has(requestUrl)) {
    recordCacheTiming(options, "Fonte ZIP", nowMs(), { source: "memoria Worker" });
  }
  if (!archiveBytesCache.has(requestUrl)) {
    const generation = archiveCacheGeneration;
    const idleTimeoutMs = Math.max(1_000, Number(options.idleTimeoutMs) || DEFAULT_ARCHIVE_IDLE_TIMEOUT_MS);
    const task = (async () => {
      const cacheReadStartedAt = nowMs();
      const cached = await readPersistentArchive(requestUrl);
      recordCacheTiming(options, "Lettura IndexedDB", cacheReadStartedAt, { hit: Boolean(cached) });
      if (cached) {
        recordCacheTiming(options, "Fonte ZIP", nowMs(), { source: "IndexedDB" });
        return cached;
      }

      const controller = new AbortController();
      let timeoutId;
      const armIdleTimeout = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => controller.abort(), idleTimeoutMs);
      };

      try {
        armIdleTimeout();
        const responseStartedAt = nowMs();
        const response = await fetch(requestUrl, {
          cache: "no-cache",
          signal: controller.signal
        });
        recordCacheTiming(options, "Risposta HTTP", responseStartedAt, { status: response.status });
        if (response.status === 404) return null;
        if (!response.ok) {
          throw new Error("HTTP " + response.status + " durante il caricamento di " + requestUrl);
        }

        const bodyStartedAt = nowMs();
        let buffer;
        if (response.body?.getReader) {
          const reader = response.body.getReader();
          const chunks = [];
          let totalBytes = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value?.byteLength) {
                chunks.push(value);
                totalBytes += value.byteLength;
                armIdleTimeout();
              }
            }
          } finally {
            reader.releaseLock();
          }

          const combined = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.byteLength;
          }
          buffer = combined.buffer;
        } else {
          buffer = await response.arrayBuffer();
        }
        recordCacheTiming(options, "Download e assemblaggio ZIP", bodyStartedAt, { bytes: buffer.byteLength });
        recordCacheTiming(options, "Fonte ZIP", nowMs(), { source: "rete" });

        const cacheWriteStartedAt = nowMs();
        await writePersistentArchive(requestUrl, buffer, generation);
        recordCacheTiming(options, "Scrittura IndexedDB", cacheWriteStartedAt);
        return buffer;
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error(
            "Download interrotto: nessun dato ricevuto per "
            + Math.round(idleTimeoutMs / 1000)
            + " secondi da " + requestUrl
            + ". Controlla la connessione e riprova."
          );
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    })();
    archiveBytesCache.set(requestUrl, task);
    task.catch(() => archiveBytesCache.delete(requestUrl));
  }
  return archiveBytesCache.get(requestUrl);
}

export async function clearArchiveCache() {
  archiveCacheGeneration += 1;
  parsedDatasetCacheGeneration += 1;
  archiveBytesCache.clear();
  const database = await openArchiveCacheDatabase();
  if (!database) return false;
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(ARCHIVE_CACHE_STORE, "readwrite");
      transaction.objectStore(ARCHIVE_CACHE_STORE).clear();
      transaction.objectStore(PARSED_DATASET_CACHE_STORE).clear();
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch { resolve(false); }
  });
}
