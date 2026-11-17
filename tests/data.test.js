import test from "node:test";
import assert from "node:assert/strict";
import { parseDataset, searchRecords } from "../JS/data.js";

const proximityHeaders = [
  "cod_egon_civ",
  "regione",
  "provincia",
  "comune",
  "frazione",
  "procom_2021",
  "strada",
  "civico",
  "km",
  "latitudine",
  "longitudine",
  "Civico dichiarato coperto da Operatori Privati in esito alla mappatura civici di prossimità 2024",
  "Coperto a giugno 2025"
];

test("proximity 2025 recognises long headers and does not require barrato", () => {
  const csv = [
    proximityHeaders.join(";"),
    [
      "380600457590056", "CAMPANIA", "AVELLINO", "AIELLO DEL SABATO", "", "64001",
      "CONTRADA PASTENACA", "6", "", "40.8956413", "14.8182354", "SI", "SI"
    ].join(";")
  ].join("\n");

  const parsed = parseDataset(csv, "civici-prossimita-2025.csv");
  assert.equal(parsed.id, "proximity2025");
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].id, "380600457590056");
  assert.equal(parsed.records[0].suffix, "");
  assert.equal(parsed.records[0].openFiberDeclared2024, "SI");
  assert.equal(parsed.records[0].coveredJune2025, "SI");
  assert.equal(parsed.records[0].latitude, "40.8956413");
  assert.equal(parsed.records[0].longitude, "14.8182354");
});

test("FiberCop proximity handles an optional leading index and SNC suffix", () => {
  const csv = [
    ["", "cod_egon_civ", "regione", "provincia", "comune", "frazione", "procom_2021", "strada", "civico", "barrato", "km", "latitudine", "longitudine", "Ammissibile (SI/NO)", "Cause esclusione"].join(";"),
    ["1", "380100061370569", "UMBRIA", "PERUGIA", "GUBBIO", "MONTELUIANO", "54024", "VOCABOLO CASALTA", "0", "SNC", "", "43.3238794444444", "12.5392369444444", "SI", ""].join(";")
  ].join("\n");

  const parsed = parseDataset(csv, "fibercop-prossimita-2025.csv");
  assert.equal(parsed.id, "fiberCopProximity2025");
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].id, "380100061370569");
  assert.equal(parsed.records[0].number, "0");
  assert.equal(parsed.records[0].suffix, "SNC");
  assert.equal(parsed.records[0].eligibility, "SI");
  assert.equal(parsed.records[0].latitude, "43.3238794444444");
  assert.equal(parsed.records[0].longitude, "12.5392369444444");
});

test("fixed network 2021 recognises the supplied speed fields", () => {
  const csv = [
    "id_egon;regione;provincia;nome_com;strada;civico;indirunito;colore_26;peak_vel_down_26;vel_max_down_26",
    "380130072676106;SICILIA;AGRIGENTO;CANICATTI';VIA ALDO MORO;10;VIA ALDO MORO, 10;n;300;2"
  ].join("\n");

  const parsed = parseDataset(csv, "mappatura-reti-fisse-2021.csv");
  assert.equal(parsed.id, "fixedSurvey2021");
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].city, "CANICATTI'");
  assert.equal(parsed.records[0].fullAddress, "VIA ALDO MORO, 10");
  assert.equal(parsed.records[0].networkColor2026, "n");
  assert.equal(parsed.records[0].peakDownload2026, "300");
  assert.equal(parsed.records[0].maxDownload2026, "2");
  assert.equal(parsed.records[0].suffix, "");
});

test("the original 2025 general and PI1G datasets remain recognised", () => {
  const general = parseDataset(
    "caratteristica;id_egon;regione;provincia;comune;frazione;strada;civico;barrato;km\nB;380130072676106;SICILIA;AGRIGENTO;CANICATTI';;VIA ALDO MORO;10;;",
    "sicilia.csv"
  );
  const pi1g = parseDataset(
    "id_egon;regione;provincia;comune;strada;civico;km;long;lat\n380130072676106;SICILIA;AGRIGENTO;CANICATTI';VIA ALDO MORO;10;;13.9;37.3",
    "pi1g-sicilia.csv"
  );

  assert.equal(general.id, "general2025");
  assert.equal(pi1g.id, "pi1g2025");
  const results = searchRecords(general.records, pi1g.records, {}, {
    region: "SICILIA",
    province: "AGRIGENTO",
    city: "CANICATTI",
    street: "VIA ALDO MORO",
    number: "10"
  });
  assert.equal(results.length, 1);
  assert.ok(results[0].general);
  assert.ok(results[0].pi1g);
});

test("CSV parsing has no record-count ceiling and handles large imports", () => {
  const rows = 150000;
  const chunks = ["id_egon;regione;provincia;nome_com;strada;civico;indirunito;colore_26;peak_vel_down_26;vel_max_down_26"];
  for (let index = 0; index < rows; index += 1) {
    chunks.push(`${380000000000000 + index};SICILIA;PALERMO;PALERMO;VIA TEST;${index + 1};VIA TEST, ${index + 1};n;300;2`);
  }

  const parsed = parseDataset(chunks.join("\n"), "mappatura-reti-fisse-2021.csv");
  assert.equal(parsed.id, "fixedSurvey2021");
  assert.equal(parsed.records.length, rows);
  assert.equal(parsed.records.at(-1).id, String(380000000000000 + rows - 1));
});
