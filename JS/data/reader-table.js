import { normalise } from "./normalization.js";

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

function getReaderColumns(recordsOrTable) {
  const columns = [];
  const seenColumns = new Set();
  const seenFiles = new Set();
  const addSource = (sourceFile, headers) => {
    const name = sourceFile || "CSV";
    if (seenFiles.has(name)) return;
    seenFiles.add(name);
    const occurrences = new Map();
    for (const rawName of headers || []) {
      const label = String(rawName ?? "").trim() || "Colonna senza nome";
      const occurrence = occurrences.get(label) || 0;
      occurrences.set(label, occurrence + 1);
      const key = label + "\u0000" + occurrence;
      if (!seenColumns.has(key)) {
        seenColumns.add(key);
        columns.push({ key, label });
      }
    }
  };

  if (recordsOrTable?.readerMode === true) {
    for (const source of recordsOrTable.sources) addSource(source.sourceFile, source.headers);
    return columns;
  }

  for (const record of recordsOrTable || []) addSource(record.sourceFile, readerHeaders(record));
  return columns;
}

function sourceValue(source, columnIndex, rowIndex) {
  return source.columns[columnIndex]?.[rowIndex] ?? "";
}

function sourceRowMatches(source, rowIndex, normalizedQuery) {
  if (!normalizedQuery) return true;
  for (let columnIndex = 0; columnIndex < source.columns.length; columnIndex += 1) {
    if (normalise(sourceValue(source, columnIndex, rowIndex)).includes(normalizedQuery)) return true;
  }
  return false;
}

function materialiseSourceRow(source, rowIndex) {
  const values = new Array(source.headers.length);
  for (let columnIndex = 0; columnIndex < values.length; columnIndex += 1) {
    values[columnIndex] = sourceValue(source, columnIndex, rowIndex);
  }
  return {
    sourceHeaders: source.headers,
    sourceValues: values,
    sourceFile: source.sourceFile || "CSV"
  };
}

function legacyRecordMatches(record, normalizedQuery) {
  if (!normalizedQuery) return true;
  for (const value of readerValues(record)) {
    if (normalise(value).includes(normalizedQuery)) return true;
  }
  return false;
}

export function getReaderPage({ table = null, records = [], page = 0, pageSize = 100, query = "" }) {
  const normalizedQuery = normalise(query);
  const safePageSize = Math.max(1, Math.min(500, Number(pageSize) || 100));
  const requestedPage = Math.max(0, Number(page) || 0);

  if (table?.readerMode === true && !normalizedQuery
    && table.sources.every((source) => !source.regionFilterRequired)) {
    const totalCount = table.count;
    const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
    const safePage = Math.min(requestedPage, totalPages - 1);
    const start = safePage * safePageSize;
    const end = start + safePageSize;
    const rows = [];
    let offset = 0;
    for (const source of table.sources) {
      const sourceStart = Math.max(0, start - offset);
      const sourceEnd = Math.min(source.rowCount, end - offset);
      for (let rowIndex = sourceStart; rowIndex < sourceEnd; rowIndex += 1) {
        rows.push(materialiseSourceRow(source, rowIndex));
      }
      offset += source.rowCount;
      if (offset >= end) break;
    }
    return {
      columns: getReaderColumns(table),
      rows,
      page: safePage,
      pageSize: safePageSize,
      totalCount,
      filteredCount: totalCount,
      totalPages
    };
  }

  const requestedStart = requestedPage * safePageSize;
  const pageRows = [];
  let regionalCount = 0;
  let filteredCount = 0;

  const scanMatches = (onMatch) => {
    let localRegionalCount = 0;
    let localFilteredCount = 0;

    if (table?.readerMode === true) {
      for (const source of table.sources) {
        for (let rowIndex = 0; rowIndex < source.rowCount; rowIndex += 1) {
          if (table.region && source.regionFilterRequired && source.regionIndex >= 0) {
            const regionValue = normalise(sourceValue(source, source.regionIndex, rowIndex));
            if (regionValue !== table.region && !regionValue.startsWith(table.region + " ")) continue;
          }
          localRegionalCount += 1;
          if (!sourceRowMatches(source, rowIndex, normalizedQuery)) continue;
          onMatch(source, rowIndex, null, localFilteredCount);
          localFilteredCount += 1;
        }
      }
    } else {
      for (const record of records) {
        localRegionalCount += 1;
        if (!legacyRecordMatches(record, normalizedQuery)) continue;
        onMatch(null, -1, record, localFilteredCount);
        localFilteredCount += 1;
      }
    }

    return { regionalCount: localRegionalCount, filteredCount: localFilteredCount };
  };

  const firstScan = scanMatches((source, rowIndex, record, matchIndex) => {
    if (matchIndex < requestedStart || matchIndex >= requestedStart + safePageSize) return;
    pageRows.push(source ? materialiseSourceRow(source, rowIndex) : record);
  });
  regionalCount = firstScan.regionalCount;
  filteredCount = firstScan.filteredCount;

  const totalPages = Math.max(1, Math.ceil(filteredCount / safePageSize));
  const safePage = Math.min(requestedPage, totalPages - 1);
  if (safePage !== requestedPage) {
    pageRows.length = 0;
    const lastPageStart = safePage * safePageSize;
    scanMatches((source, rowIndex, record, matchIndex) => {
      if (matchIndex < lastPageStart || matchIndex >= lastPageStart + safePageSize) return;
      pageRows.push(source ? materialiseSourceRow(source, rowIndex) : record);
    });
  }

  return {
    columns: getReaderColumns(table?.readerMode === true ? table : records),
    rows: pageRows,
    page: safePage,
    pageSize: safePageSize,
    totalCount: regionalCount,
    filteredCount,
    totalPages
  };
}
