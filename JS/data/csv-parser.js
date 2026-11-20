import { DATASET_DEFINITIONS, FIELD_ALIASES } from "../datasets.js?v=1.2.009";
import { normalise } from "./normalization.js";
import { nowMs, recordTiming } from "./diagnostics.js";

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
  // Determine the line-ending style once. Searching for both \n and \r from
  // every row makes LF-only files quadratic because the absent character is
  // repeatedly searched all the way to the end of the remaining CSV.
  const lineBreak = text.includes("\n") ? "\n" : "\r";
  let start = 0;

  while (start < text.length) {
    const separatorIndex = text.indexOf(lineBreak, start);
    const lineEnd = separatorIndex < 0 ? text.length : separatorIndex;
    const contentEnd = lineBreak === "\n"
      && lineEnd > start
      && text.charCodeAt(lineEnd - 1) === 13
      ? lineEnd - 1
      : lineEnd;
    const line = text.slice(start, contentEnd);

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

    if (separatorIndex < 0) break;
    start = separatorIndex + 1;
    if (lineBreak === "\r" && text[start] === "\n") start += 1;
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
  if (privateCoverageHeader || hasJuneCoverage || forcedType === "proximity2025") {
    return "proximity2025";
  }
  if ((hasEligibility && hasExclusion) || forcedType === "privateProximity2025"
    || filename.includes("privateproximity") || filename.includes("prossimitaprivati")
    || filename.includes("consultazioneprossimita")) return "privateProximity2025";
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
const INTERNED_FIELDS = new Set([
  "characteristic",
  "region",
  "province",
  "city",
  "district",
  "procom",
  "number",
  "suffix",
  "municipalityCode"
]);
const DEFAULT_RECORD_FIELDS = Object.freeze([
  "characteristic", "region", "province", "city",
  "district", "procom", "number", "suffix"
]);

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

function makeRecord(row, originalHeaders, headers, columns, recordFieldColumns, extraFieldIndexes, datasetId, intern, cachedNormalise, options = {}, sourceFile = "", sourceRowNumber = 0) {
  const id = readValue(row, columns.id);
  const fullAddress = readValue(row, columns.fullAddress);
  const record = { id, datasetId };

  // Store only columns actually present in this CSV. A fixed 50-field object
  // wastes substantial memory when repeated across millions of records.
  for (const [field, columnIndex] of recordFieldColumns) {
    let value = readValue(row, columnIndex);
    if (field === "characteristic") value = intern(value.toUpperCase());
    else if (INTERNED_FIELDS.has(field)) value = intern(value);
    record[field] = value;
  }

  record.street = record.street || fullAddress;
  record.fullAddress = fullAddress;
  for (const field of DEFAULT_RECORD_FIELDS) {
    if (record[field] === undefined) record[field] = "";
  }
  record.openFiberDeclared2024 = readValue(row, columns.openFiberDeclared2024);
  record.networkColor2026Present = columns.networkColor2026 >= 0;

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
  const collector = createDatasetRowCollector(name, forcedType, options, headerInfo);
  parseDelimitedRows(cleanText, headerInfo.delimiter, collector.onRow);
  return collector.finish();
}

function createDatasetRowCollector(name, forcedType, options, headerInfo) {
  let originalHeaders = [];
  let headers = [];
  let columns = null;
  let datasetId = "";
  let rowIndex = 0;
  let headerFound = false;
  let readerHeaders = null;
  let readerOffset = 0;
  let extraFieldIndexes = [];
  let recordFieldColumns = [];
  const records = [];
  const intern = createStringInterner();
  const cachedNormalise = createNormaliseCache();

  function onRow(row) {
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
      recordFieldColumns = Object.entries(columns).filter(([field, columnIndex]) =>
        columnIndex >= 0 && field !== "id" && field !== "openFiberDeclared2024"
      );
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
      recordFieldColumns,
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
  }

  return {
    onRow,
    finish() {
      return headerFound ? { id: datasetId, records, name } : null;
    }
  };
}

function createChunkDelimitedParser(delimiter, onRow, initialText = "") {
  let mode = initialText.includes('"') ? "quoted" : "plain";
  let plainBuffer = "";
  let quotedBuffer = "";
  let row = [];
  let value = "";
  let quoted = false;
  let finished = false;

  function emitRow() {
    row.push(value);
    let hasContent = false;
    for (let index = 0; index < row.length; index += 1) {
      if (row[index].trim() !== "") {
        hasContent = true;
        break;
      }
    }
    if (hasContent && onRow(row) === false) finished = true;
    row = [];
    value = "";
  }

  function processQuoted(text, final = false) {
    const combined = quotedBuffer + text;
    let index = 0;
    while (index < combined.length && !finished) {
      const character = combined[index];
      if (quoted) {
        if (character === '"') {
          if (index + 1 >= combined.length && !final) break;
          if (combined[index + 1] === '"') {
            value += '"';
            index += 2;
          } else {
            quoted = false;
            index += 1;
          }
        } else {
          value += character;
          index += 1;
        }
        continue;
      }

      if (character === '"' && value.trim() === "") {
        quoted = true;
        index += 1;
      } else if (character === delimiter) {
        row.push(value);
        value = "";
        index += 1;
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && combined[index + 1] === "\n") index += 1;
        emitRow();
        index += 1;
      } else {
        value += character;
        index += 1;
      }
    }

    quotedBuffer = combined.slice(index);
  }

  function processPlain() {
    const quoteIndex = plainBuffer.indexOf('"');
    if (quoteIndex >= 0) {
      const previousLineFeed = plainBuffer.lastIndexOf("\n", quoteIndex - 1);
      const previousCarriageReturn = plainBuffer.lastIndexOf("\r", quoteIndex - 1);
      const completeEnd = Math.max(previousLineFeed, previousCarriageReturn) + 1;
      const completeRows = plainBuffer.slice(0, completeEnd);
      const remainder = plainBuffer.slice(completeEnd);
      if (completeRows) parsePlainDelimitedRows(completeRows, delimiter, onRow);
      plainBuffer = "";
      mode = "quoted";
      processQuoted(remainder);
      return;
    }

    const lastLineFeed = plainBuffer.lastIndexOf("\n");
    const lastCarriageReturn = plainBuffer.lastIndexOf("\r");
    const completeEnd = Math.max(lastLineFeed, lastCarriageReturn) + 1;
    if (completeEnd > 0) {
      const completeRows = plainBuffer.slice(0, completeEnd);
      plainBuffer = plainBuffer.slice(completeEnd);
      parsePlainDelimitedRows(completeRows, delimiter, onRow);
    }
  }

  return {
    push(text) {
      if (finished || !text) return;
      if (mode === "plain") {
        plainBuffer += text;
        processPlain();
      } else {
        processQuoted(text);
      }
    },
    finish() {
      if (finished) return;
      if (mode === "plain") {
        if (plainBuffer) parsePlainDelimitedRows(plainBuffer, delimiter, onRow);
        plainBuffer = "";
      } else {
        processQuoted("", true);
        if (!finished && (value.length || row.length)) emitRow();
        quotedBuffer = "";
      }
      finished = true;
    }
  };
}

function createStreamingDatasetParser(name, forcedType, options = {}) {
  let sample = "";
  let rowParser = null;
  let collector = null;
  let invalidHeader = false;

  function initialise() {
    const headerInfo = findHeader(sample);
    if (!headerInfo) {
      invalidHeader = true;
      sample = "";
      return;
    }
    collector = createDatasetRowCollector(name, forcedType, options, headerInfo);
    rowParser = createChunkDelimitedParser(headerInfo.delimiter, collector.onRow, sample);
    rowParser.push(sample);
    sample = "";
  }

  return {
    push(text) {
      if (invalidHeader || !text) return;
      if (!rowParser) {
        sample += text;
        if (sample.length >= HEADER_SAMPLE_SIZE) initialise();
      } else {
        rowParser.push(text);
      }
    },
    finish() {
      if (!rowParser && !invalidHeader) initialise();
      if (rowParser) rowParser.finish();
      return collector ? collector.finish() : null;
    }
  };
}

export function parseDatasetStream(streamHelper, name = "dataset", forcedType = "", options = {}) {
  return new Promise((resolve, reject) => {
    let decoder = null;
    let sampleChunks = [];
    let sampleBytes = 0;
    let parser = null;
    let decodeDuration = 0;
    let parseDuration = 0;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const feedText = (text) => {
      if (!text || !parser) return;
      const startedAt = nowMs();
      parser.push(text);
      parseDuration += nowMs() - startedAt;
    };

    const initialiseDecoder = () => {
      const sample = new Uint8Array(sampleBytes);
      let offset = 0;
      for (const chunk of sampleChunks) {
        sample.set(chunk, offset);
        offset += chunk.byteLength;
      }

      const decodeStartedAt = nowMs();
      try {
        const utf8 = new TextDecoder("utf-8", { fatal: true });
        const decoded = utf8.decode(sample);
        decoder = new TextDecoder("utf-8");
        decodeDuration += nowMs() - decodeStartedAt;
        parser = createStreamingDatasetParser(name, forcedType, options);
        feedText(decoded);
      } catch {
        decoder = new TextDecoder("windows-1252");
        const decoded = decoder.decode(sample);
        decodeDuration += nowMs() - decodeStartedAt;
        parser = createStreamingDatasetParser(name, forcedType, options);
        feedText(decoded);
      }
      sampleChunks = [];
      sampleBytes = 0;
    };

    streamHelper
      .on("data", (rawChunk) => {
        try {
          const chunk = rawChunk instanceof Uint8Array ? rawChunk : new Uint8Array(rawChunk);
          if (!decoder) {
            sampleChunks.push(chunk.slice());
            sampleBytes += chunk.byteLength;
            if (sampleBytes >= HEADER_SAMPLE_SIZE) initialiseDecoder();
            return;
          }

          const decodeStartedAt = nowMs();
          const decoded = decoder.decode(chunk, { stream: true });
          decodeDuration += nowMs() - decodeStartedAt;
          feedText(decoded);
        } catch (error) {
          fail(error);
        }
      })
      .on("error", fail)
      .on("end", () => {
        if (settled) return;
        try {
          if (!decoder) initialiseDecoder();
          else {
            const decodeStartedAt = nowMs();
            const tail = decoder.decode();
            decodeDuration += nowMs() - decodeStartedAt;
            feedText(tail);
          }

          const result = parser ? parser.finish() : null;
          if (Array.isArray(options.timings)) {
            recordTiming({ timings: options.timings, datasetKey: options.datasetKey }, "Decodifica CSV streaming", nowMs() - decodeDuration, { entry: name });
            recordTiming({ timings: options.timings, datasetKey: options.datasetKey }, "Parsing CSV streaming", nowMs() - parseDuration, { entry: name });
          }
          settled = true;
          resolve(result);
        } catch (error) {
          fail(error);
        }
      });

    try {
      streamHelper.resume();
    } catch (error) {
      fail(error);
    }
  });
}


export { decodeBuffer, headerKey };

// Streamed CSV parsing retains only a small header sample and one unfinished row.
