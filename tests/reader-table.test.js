import test from "node:test";
import assert from "node:assert/strict";
import { getReaderPage } from "../JS/data/reader-table.js";
import { normalise } from "../JS/data/normalization.js";

function makeTable() {
  return {
    readerMode: true,
    region: normalise("Sicilia"),
    count: 4,
    sources: [{
      sourceFile: "SICILIA.csv",
      headers: ["Regione", "Comune", "EGON"],
      regionIndex: 0,
      regionFilterRequired: true,
      rowCount: 4,
      columns: [
        ["Sicilia", "Sicilia", "Calabria", "Sicilia"],
        ["Palermo", "Catania", "Catanzaro", "Messina"],
        ["1001", "1002", "2001", "1003"]
      ]
    }]
  };
}

test("compact Reader table returns the requested page and filters by region", () => {
  const result = getReaderPage({ table: makeTable(), records: [], page: 0, pageSize: 1 });
  assert.equal(result.totalCount, 3);
  assert.equal(result.filteredCount, 3);
  assert.equal(result.totalPages, 3);
  assert.equal(result.page, 0);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].sourceValues[1], "Palermo");
  assert.equal(result.rows[0].sourceFile, "SICILIA.csv");
  assert.deepEqual(result.columns.map((column) => column.label), ["Regione", "Comune", "EGON"]);
});

test("Reader query scans rows without returning nonmatching records", () => {
  const result = getReaderPage({ table: makeTable(), page: 0, pageSize: 20, query: "CATANIA" });
  assert.equal(result.filteredCount, 1);
  assert.equal(result.totalPages, 1);
  assert.equal(result.rows[0].sourceValues[1], "Catania");
});

test("Reader clamps an out-of-range page to the last page", () => {
  const result = getReaderPage({ table: makeTable(), page: 99, pageSize: 1 });
  assert.equal(result.page, 2);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].sourceValues[1], "Messina");
});

test("legacy manual Reader records remain readable", () => {
  const records = [{
    sourceFile: "manual.csv",
    sourceFields: [
      { name: "Comune", value: "Palermo" },
      { name: "Civico", value: "12" }
    ]
  }];
  const result = getReaderPage({ records, page: 0, pageSize: 10, query: "12" });
  assert.equal(result.totalCount, 1);
  assert.equal(result.filteredCount, 1);
  assert.equal(result.rows[0].sourceFile, "manual.csv");
  assert.deepEqual(result.columns.map((column) => column.label), ["Comune", "Civico"]);
});

test("columnar regional archive pages directly when every row matches the selected Region", () => {
  const table = {
    readerMode: true,
    region: normalise("Sicilia"),
    count: 3,
    sources: [{
      sourceFile: "SICILIA.csv",
      headers: ["Regione", "Comune"],
      regionIndex: 0,
      regionFilterRequired: false,
      rowCount: 3,
      columns: [
        ["Sicilia", "Sicilia", "Sicilia"],
        ["Palermo", "Catania", "Messina"]
      ]
    }]
  };
  const result = getReaderPage({ table, page: 1, pageSize: 1 });
  assert.equal(result.totalCount, 3);
  assert.equal(result.filteredCount, 3);
  assert.equal(result.rows[0].sourceValues[1], "Catania");
});
