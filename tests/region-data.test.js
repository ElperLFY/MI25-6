import test from "node:test";
import assert from "node:assert/strict";
import { createRegionDataController } from "../JS/controllers/region-data.js";
import { EXTRA_DATASET_KEYS } from "../JS/datasets.js";

test("initial regional load defers the 2021 survey and loads it only on explicit request", async () => {
  const ids = [
    "region", "search-button", "region-hint", "data-status", "results-card",
    "search-error", "load-diagnostics", "load-diagnostics-content",
    "load-2021-dataset", "load-2021-dataset-status"
  ];
  const elements = new Map(ids.map((id) => [id, {
    value: id === "region" ? "Sicilia" : "",
    textContent: "",
    hidden: false,
    disabled: false
  }]));
  const $ = (id) => {
    const element = elements.get(id);
    assert.ok(element, "Unexpected element lookup: " + id);
    return element;
  };

  const state = {
    generalCount: 0,
    pi1gCount: 0,
    extraCounts: Object.fromEntries(EXTRA_DATASET_KEYS.map((key) => [key, 0])),
    manualGeneral: false,
    manualPi1g: false,
    manualExtras: new Set(),
    checkedExtras: new Set(),
    extraAvailability: {},
    pi1gAvailable: false,
    loadedRegion: "",
    loadToken: 0,
    searchToken: 0,
    readerLoadToken: 0,
    readerLoaded: false,
    readerPage: 0,
    csvReaderMode: false
  };
  const calls = [];
  const loadRegionalData = async (region, options) => {
    calls.push({ region, options });
    if (options.loadExtras?.includes("fixedSurvey2021")) {
      return {
        counts: {
          general: 10,
          pi1g: 5,
          pi1gAvailable: true,
          extra: { fixedSurvey2021: 7, proximity2025: 2, fiberCopProximity2025: 1 },
          extraAvailable: { fixedSurvey2021: true, proximity2025: true, fiberCopProximity2025: true }
        },
        extraErrors: {},
        timings: null
      };
    }
    return {
      counts: {
        general: 10,
        pi1g: 5,
        pi1gAvailable: true,
        extra: { fixedSurvey2021: 0, proximity2025: 2, fiberCopProximity2025: 1 },
        extraAvailable: { proximity2025: true, fiberCopProximity2025: true }
      },
      extraErrors: {},
      timings: null
    };
  };

  const controller = createRegionDataController({
    $,
    state,
    loadRegionalData,
    clearArchiveCache: async () => true,
    scheduleSuggestions: () => {},
    renderCsvReaderPage: async () => {},
    loadCsvReaderDataset: async () => {}
  });

  await controller.loadSelectedRegion();

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].options.loadExtras, ["proximity2025", "fiberCopProximity2025"]);
  assert.equal(calls[0].options.loadExtras.includes("fixedSurvey2021"), false);
  assert.equal(state.loadedRegion, "Sicilia");
  assert.equal($("load-2021-dataset").disabled, false);
  assert.equal($("load-2021-dataset").textContent, "Carica mappatura 2021");

  await controller.loadAdditionalDataset();

  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.loadGeneral, false);
  assert.equal(calls[1].options.loadPi1g, false);
  assert.deepEqual(calls[1].options.loadExtras, ["fixedSurvey2021"]);
  assert.equal(state.extraCounts.fixedSurvey2021, 7);
  assert.equal(state.checkedExtras.has("fixedSurvey2021"), true);
  assert.equal($("load-2021-dataset").disabled, true);
  assert.equal($("load-2021-dataset").textContent, "Mappatura 2021 caricata");
});
