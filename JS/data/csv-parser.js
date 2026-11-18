import { DATASET_DEFINITIONS, FIELD_ALIASES } from "../datasets.js";
import { normalise } from "./normalization.js";

const FIELD_HEADER_KEYS = new Set(Object.values(FIELD_ALIASES).flat());

const HEADER_SCAN_LIMIT = 100;
const HEADER_SAMPLE_SIZE = 512 * 1024;

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

function parsePlainDelimitedRows(text, delimiter, onRow) {
  let start = 0;

  while (start < text.length) {
    let lineEnd = text.indexOf("\n", start);
    const carriageEnd = text.indexOf("\r", start);
    if (lineEnd < 0 || (carriageEnd >= 0 && carriageEnd < lineEnd)) lineEnd = carriageEnd;
    if (lineEnd < 0) lineEnd = text.length;

    const line = text.slice(start, lineEnd);
    if (line) {
      const row = line.split(delimiter);
      let hasContent = false;
      for (let index = 0; index < row.length; index += 1) {
        if (row[index].trim() !== "") {
          hasContent = true;
          break;
        }
      }
      if (hasContent && onRow(row) === false) return;
    }

    if (lineEnd === text.length) break;
    const lineEnding = text[lineEnd];
    start = lineEnd + 1;
    if (lineEnding === "\r" && text[start] === "\n") start += 1;
  }
}

function parseDelimitedRows(text, delimiter, onRow) {
  // Most source files contain no quoted fields. Let the native string splitter
  // handle those rows instead of scanning and concatenating every character.
  if (!text.includes('"')) {
    parsePlainDelimitedRows(text, delimiter, onRow);
    return;
  }

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

const EMPTY_EXTRA_FIELDS = Object.freeze([]);

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

function makeRecord(row, originalHeaders, headers, columns, extraFieldIndexes, datasetId, intern, cachedNormalise, options = {}, sourceFile = "", sourceRowNumber = 0) {
  // IDs and complete addresses are high-cardinality values. Interning them
  // keeps a large Map alive for millions of mostly unique strings.
  const id = readValue(row, columns.id);
  const fullAddress = readValue(row, columns.fullAddress);
  const streetValue = readValue(row, columns.street) || fullAddress;
  const record = {
    id,
    characteristic: intern(readValue(row, columns.characteristic).toUpperCase()),
    region: intern(readValue(row, columns.region)),
    province: intern(readValue(row, columns.province)),
    city: intern(readValue(row, columns.city)),
    district: intern(readValue(row, columns.district)),
    procom: intern(readValue(row, columns.procom)),
    street: streetValue,
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
  for (const index of extraFieldIndexes) {
    const value = String(row[index] ?? "").trim();
    if (value) extraFields.push({ name: originalHeaders[index] || headers[index], value });
  }
  record.extraFields = extraFields.length ? extraFields : EMPTY_EXTRA_FIELDS;
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
  // These fields are often unique per civic. Avoid retaining a second,
  // application-wide Map entry for every distinct street/address.
  record.normalisedStreet = normalise(record.street);
  record.normalisedFullAddress = normalise(record.fullAddress);
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
  let extraFieldIndexes = [];
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
      extraFieldIndexes = [];
      for (let index = 0; index < headers.length; index += 1) {
        if (!FIELD_HEADER_KEYS.has(headers[index]) && index !== columns.openFiberDeclared2024) {
          extraFieldIndexes.push(index);
        }
      }
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
      extraFieldIndexes,
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

export { decodeBuffer, headerKey };
