import test from "node:test";
import assert from "node:assert/strict";
import { decodeFixedSurvey2021Color, decodeFixedSurvey2021Speed, loadRegionalData, parseDataset, parseUploadedFiles, searchRecords } from "../JS/data.js";

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
  assert.equal(parsed.records[0].networkColor2026Present, true);
  assert.equal(parsed.records[0].peakDownload2026, "300");
  assert.equal(parsed.records[0].maxDownload2026, "2");
  assert.equal(parsed.records[0].suffix, "");
});

test("targeted CSV parsing keeps only the requested address and can retain original fields", () => {
  const csv = [
    "id_egon;regione;provincia;nome_com;strada;civico;indirunito;colore_26;peak_vel_down_26;vel_max_down_26;campo_extra",
    "380100150514555;SICILIA;AGRIGENTO;PORTO EMPEDOCLE;VIA DELLO SPORT;10;VIA DELLO SPORT, 10;g;1000;2;valore originale",
    "380100150514556;SICILIA;AGRIGENTO;PORTO EMPEDOCLE;VIA GARIBALDI;2;VIA GARIBALDI, 2;n;300;1;altro"
  ].join("\n");

  const parsed = parseDataset(csv, "mappatura-reti-fisse-2021.csv", "", {
    query: {
      region: "SICILIA",
      province: "AGRIGENTO",
      city: "PORTO EMPEDOCLE",
      street: "VIA DELLO SPORT",
      number: "10"
    },
    includeSourceFields: true
  });

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].id, "380100150514555");
  assert.equal(parsed.records[0].sourceFields[0].name, "id_egon");
  assert.equal(parsed.records[0].sourceFields[7].name, "colore_26");
  assert.equal(parsed.records[0].sourceFields[7].value, "g");
  assert.equal(parsed.records[0].sourceFields[10].name, "campo_extra");
  assert.equal(parsed.records[0].sourceFields[10].value, "valore originale");
  assert.equal(parsed.records[0].sourceFile, "mappatura-reti-fisse-2021.csv");
});

test("fixed survey 2021 decodes color and 2026 speed bands", () => {
  assert.equal(decodeFixedSurvey2021Color("g"), "Grigio");
  assert.equal(decodeFixedSurvey2021Color("b"), "Bianco");
  assert.equal(decodeFixedSurvey2021Color("n"), "Nero");
  assert.equal(decodeFixedSurvey2021Color(""), "Bianco");
  assert.equal(decodeFixedSurvey2021Color("", false), "");

  assert.equal(decodeFixedSurvey2021Speed("0", true), "< 30 Mbit/s");
  assert.equal(decodeFixedSurvey2021Speed("1", true), "< 300 Mbit/s");
  assert.equal(decodeFixedSurvey2021Speed("2", true), "≥ 300 Mbit/s");
  assert.equal(decodeFixedSurvey2021Speed("30", true), "30–99 Mbit/s");
  assert.equal(decodeFixedSurvey2021Speed("100", true), "100–199 Mbit/s");
  assert.equal(decodeFixedSurvey2021Speed("200", true), "200–299 Mbit/s");
  assert.equal(decodeFixedSurvey2021Speed("300", true), "300–999 Mbit/s");
  assert.equal(decodeFixedSurvey2021Speed("1000", true), "≥ 1.000 Mbit/s");
  assert.equal(decodeFixedSurvey2021Speed("0", false), "< 300 Mbit/s");
  assert.equal(decodeFixedSurvey2021Speed("1", false), "≥ 300 Mbit/s");
  assert.equal(decodeFixedSurvey2021Speed("42", true), "Codice velocità non documentato (42)");

  const withoutColorColumn = parseDataset(
    "id_egon;regione;provincia;nome_com;strada;civico;vel_max_down_26;peak_vel_down_26\n380100150514555;SICILIA;AGRIGENTO;PORTO EMPEDOCLE;VIA DELLO SPORT;10;1;0",
    "mappatura-reti-fisse-2021.csv"
  );
  assert.equal(withoutColorColumn.records[0].networkColor2026Present, false);
  assert.equal(decodeFixedSurvey2021Speed(withoutColorColumn.records[0].maxDownload2026, withoutColorColumn.records[0].networkColor2026Present), "≥ 300 Mbit/s");
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


test("italia.zip opens uppercase regional ZIPs and imports their CSV files", async () => {
  const encoder = new TextEncoder();
  const toArrayBuffer = (value) => encoder.encode(value).buffer;
  const csv = [
    proximityHeaders.join(";"),
    ["380600457590056", "SICILIA", "PALERMO", "PALERMO", "", "64001", "VIA TEST", "12", "", "38.1157", "13.3615", "SI", "SI"].join(";")
  ].join("\n");
  const entry = (name, payload) => ({
    name, dir: false,
    _data: { uncompressedSize: encoder.encode(payload).length },
    async: async (type) => type === "string" ? payload : toArrayBuffer(payload)
  });
  const archives = {
    ROOT: {
      files: {
        "ABRUZZO.zip": entry("ABRUZZO.zip", "REGION_ABRUZZO"),
        "SICILIA.zip": entry("SICILIA.zip", "REGION_SICILIA")
      }
    },
    REGION_ABRUZZO: {
      files: { "CIVICI.csv": entry("CIVICI.csv", csv.replace("SICILIA", "ABRUZZO").replace("PALERMO", "L'AQUILA")) }
    },
    REGION_SICILIA: { files: { "CIVICI.csv": entry("CIVICI.csv", csv) } }
  };
  globalThis.window = {
    JSZip: {
      loadAsync: async (buffer) => {
        const key = new TextDecoder().decode(buffer);
        assert.ok(archives[key], "unexpected ZIP fixture: " + key);
        return archives[key];
      }
    }
  };
  try {
    const imported = await parseUploadedFiles([{
      name: "italia.zip",
      size: encoder.encode("ROOT").length,
      arrayBuffer: async () => toArrayBuffer("ROOT")
    }]);
    assert.equal(imported.datasets.proximity2025.length, 2);
    assert.deepEqual(
      imported.datasets.proximity2025.map((record) => record.region).sort(),
      ["ABRUZZO", "SICILIA"]
    );
  } finally {
    delete globalThis.window;
  }
});

test("FiberCop is inferred from eligibility and exclusion headers inside a regional ZIP", async () => {
  const encoder = new TextEncoder();
  const toArrayBuffer = (value) => encoder.encode(value).buffer;
  const csv = [
    ["cod_egon_civ", "regione", "provincia", "comune", "strada", "civico", "Ammissibile (SI/NO)", "Cause esclusione"].join(";"),
    ["820530000000001", "SICILIA", "PALERMO", "PALERMO", "VIA TEST", "1", "SI", ""].join(";")
  ].join("\n");
  const entry = (name, payload) => ({
    name, dir: false,
    _data: { uncompressedSize: encoder.encode(payload).length },
    async: async (type) => type === "string" ? payload : toArrayBuffer(payload)
  });
  const archives = {
    ROOT_FC: { files: { "SICILIA.zip": entry("SICILIA.zip", "REGION_FC") } },
    REGION_FC: { files: { "CIVICI.csv": entry("CIVICI.csv", csv) } }
  };
  globalThis.window = {
    JSZip: {
      loadAsync: async (buffer) => {
        const key = new TextDecoder().decode(buffer);
        assert.ok(archives[key], "unexpected ZIP fixture: " + key);
        return archives[key];
      }
    }
  };
  try {
    const imported = await parseUploadedFiles([{
      name: "italia.zip",
      size: encoder.encode("ROOT_FC").length,
      arrayBuffer: async () => toArrayBuffer("ROOT_FC")
    }]);
    assert.equal(imported.datasets.fiberCopProximity2025.length, 1);
    assert.equal(imported.datasets.fiberCopProximity2025[0].eligibility, "SI");
  } finally {
    delete globalThis.window;
  }
});



test("2021 regional data loads from the uploaded uppercase regional ZIP", async () => {
  const encoder = new TextEncoder();
  const toArrayBuffer = (value) => encoder.encode(value).buffer;
  const csv = [
    "id_egon;regione;provincia;nome_com;strada;civico;indirunito;colore_26;peak_vel_down_26;vel_max_down_26",
    "380100150514555;SICILIA;AGRIGENTO;PORTO EMPEDOCLE;VIA DELLO SPORT;10;VIA DELLO SPORT, 10;g;1000;2",
    "380100150514556;SICILIA;AGRIGENTO;PORTO EMPEDOCLE;VIA GARIBALDI;2;VIA GARIBALDI, 2;n;300;1"
  ].join("\n");
  const entry = {
    name: "MAPPATURA.csv",
    dir: false,
    _data: { uncompressedSize: encoder.encode(csv).length },
    async: async (type) => type === "string" ? csv : toArrayBuffer(csv)
  };
  const oldWindow = globalThis.window;
  const oldFetch = globalThis.fetch;
  const requested = [];
  globalThis.window = {
    JSZip: {
      loadAsync: async (buffer) => {
        assert.equal(new TextDecoder().decode(buffer), "REGION_2021_SICILIA");
        return { files: { "MAPPATURA.csv": entry } };
      }
    }
  };
  globalThis.fetch = async (path) => {
    requested.push(path);
    if (path === "data/fixed-2021/SICILIA.zip") {
      return { status: 200, ok: true, arrayBuffer: async () => toArrayBuffer("REGION_2021_SICILIA") };
    }
    return { status: 404, ok: false };
  };

  try {
    const result = await loadRegionalData("Sicilia", {
      loadGeneral: false,
      loadPi1g: false,
      loadExtras: ["fixedSurvey2021"],
      query: {
        region: "SICILIA",
        province: "AGRIGENTO",
        city: "PORTO EMPEDOCLE",
        street: "VIA DELLO SPORT",
        number: "10"
      }
    });
    assert.deepEqual(requested, ["data/fixed-2021/SICILIA.zip"]);
    assert.equal(result.extraAvailable.fixedSurvey2021, true);
    assert.equal(result.extra.fixedSurvey2021.length, 1);
    assert.equal(result.extra.fixedSurvey2021[0].id, "380100150514555");
    assert.equal(result.extra.fixedSurvey2021[0].networkColor2026, "g");
    assert.equal(result.extra.fixedSurvey2021[0].maxDownload2026, "2");

    const reader = await loadRegionalData("Sicilia", {
      loadGeneral: false,
      loadPi1g: false,
      loadExtras: ["fixedSurvey2021"],
      includeSourceFields: true
    });
    assert.equal(reader.extra.fixedSurvey2021.length, 2);
    assert.equal(reader.extra.fixedSurvey2021[0].sourceFields[0].name, "id_egon");
    assert.equal(reader.extra.fixedSurvey2021[0].sourceFields[7].name, "colore_26");
    assert.equal(reader.extra.fixedSurvey2021[0].sourceFields[7].value, "g");

    const lightweightReader = await loadRegionalData("Sicilia", {
      loadGeneral: false,
      loadPi1g: false,
      loadExtras: ["fixedSurvey2021"],
      readerMode: true
    });
    const rawRow = lightweightReader.extra.fixedSurvey2021[0];
    assert.equal(lightweightReader.extra.fixedSurvey2021.length, 2);
    assert.equal(rawRow.sourceHeaders[7], "colore_26");
    assert.equal(rawRow.sourceValues[7], "g");
    assert.equal(rawRow.sourceValues[10], undefined);
    assert.equal(rawRow.normalisedRegion, "SICILIA");
    assert.equal(rawRow.key, undefined);
    assert.equal(rawRow.sourceFile, "MAPPATURA.csv");
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
    if (oldFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = oldFetch;
  }
});

test("regional lookup opens only the matching uppercase ZIP from italia.zip", async () => {
  const encoder = new TextEncoder();
  const toArrayBuffer = (value) => encoder.encode(value).buffer;
  const csv = [
    proximityHeaders.join(";"),
    ["380600457590056", "SICILIA", "PALERMO", "PALERMO", "", "64001", "VIA TEST", "12", "", "38.1157", "13.3615", "SI", "SI"].join(";")
  ].join("\n");
  const entry = (name, payload) => ({
    name, dir: false,
    _data: { uncompressedSize: encoder.encode(payload).length },
    async: async (type) => type === "string" ? payload : toArrayBuffer(payload)
  });
  const archives = {
    ROOT_REGION_FILTER: {
      files: {
        "ABRUZZO.zip": entry("ABRUZZO.zip", "REGION_ABRUZZO_FILTER"),
        "SICILIA.zip": entry("SICILIA.zip", "REGION_SICILIA_FILTER")
      }
    },
    REGION_SICILIA_FILTER: { files: { "CIVICI.csv": entry("CIVICI.csv", csv) } }
  };
  const loaded = [];
  const oldWindow = globalThis.window;
  const oldFetch = globalThis.fetch;
  globalThis.window = {
    JSZip: {
      loadAsync: async (buffer) => {
        const key = new TextDecoder().decode(buffer);
        if (key.startsWith("REGION_")) loaded.push(key);
        assert.ok(archives[key], "unexpected ZIP fixture: " + key);
        return archives[key];
      }
    }
  };
  globalThis.fetch = async (path) => {
    if (path.endsWith("/sicilia.zip")) return { status: 404, ok: false };
    if (path.endsWith("/italia.zip")) return { status: 404, ok: false };
    if (path.endsWith("/Italia.zip")) return {
      status: 200,
      ok: true,
      arrayBuffer: async () => toArrayBuffer("ROOT_REGION_FILTER")
    };
    throw new Error("Unexpected fetch path: " + path);
  };
  try {
    const result = await loadRegionalData("Sicilia", {
      loadGeneral: false,
      loadPi1g: false,
      loadExtras: ["proximity2025"]
    });
    assert.equal(result.extra.proximity2025.length, 1);
    assert.equal(result.extra.proximity2025[0].region, "SICILIA");
    assert.deepEqual(loaded, ["REGION_SICILIA_FILTER"]);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
    if (oldFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = oldFetch;
  }
});
