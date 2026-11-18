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
      try { request = indexedDB.open(ARCHIVE_CACHE_DB_NAME, ARCHIVE_CACHE_DB_VERSION); }
      catch { resolve(null); return; }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ARCHIVE_CACHE_STORE)) database.createObjectStore(ARCHIVE_CACHE_STORE, { keyPath: "key" });
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

export async function getArchiveBytes(path, baseUrl = "") {
  const requestUrl = baseUrl ? new URL(path, baseUrl).href : path;
  if (!archiveBytesCache.has(requestUrl)) {
    const generation = archiveCacheGeneration;
    const task = (async () => {
      const cached = await readPersistentArchive(requestUrl);
      if (cached) return cached;
      const response = await fetch(requestUrl, { cache: "no-cache" });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("HTTP " + response.status + " durante il caricamento di " + requestUrl);
      const buffer = await response.arrayBuffer();
      await writePersistentArchive(requestUrl, buffer, generation);
      return buffer;
    })();
    archiveBytesCache.set(requestUrl, task);
    task.catch(() => archiveBytesCache.delete(requestUrl));
  }
  return archiveBytesCache.get(requestUrl);
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
    } catch { resolve(false); }
  });
}
