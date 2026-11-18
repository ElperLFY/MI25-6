import test from "node:test";
import assert from "node:assert/strict";
import { createSearchController } from "../JS/controllers/search.js";

test("clearSearch resets autocomplete suggestion state through an injected dependency", () => {
  const ids = [
    "region", "province", "city", "street", "street-number",
    "province-options", "city-options", "street-options", "number-options",
    "region-hint", "province-hint", "city-hint", "street-hint", "number-hint",
    "search-error", "results-card"
  ];
  const elements = new Map(ids.map((id) => [id, {
    value: "stale value",
    textContent: "stale content",
    hidden: false
  }]));
  const $ = (id) => {
    const element = elements.get(id);
    assert.ok(element, `Unexpected element lookup: ${id}`);
    return element;
  };
  const suggestionValues = {
    region: ["old region"],
    province: ["old province"],
    city: ["old city"],
    street: ["old street"],
    number: ["old number"]
  };
  let regionReloads = 0;

  const controller = createSearchController({
    $,
    state: {},
    suggestionValues,
    closeSuggestions: () => {},
    loadSelectedRegion: () => { regionReloads += 1; }
  });

  controller.clearSearch();

  for (const id of ["region", "province", "city", "street", "street-number"]) {
    assert.equal($(id).value, "", `${id} should be cleared`);
  }
  for (const id of ["province-options", "city-options", "street-options", "number-options"]) {
    assert.equal($(id).textContent, "", `${id} should be cleared`);
  }
  for (const id of ["region-hint", "province-hint", "city-hint", "street-hint", "number-hint", "search-error"]) {
    assert.equal($(id).textContent, "", `${id} should be cleared`);
  }
  assert.deepEqual(suggestionValues, {
    region: [],
    province: [],
    city: [],
    street: [],
    number: []
  });
  assert.equal($("results-card").hidden, true);
  assert.equal(regionReloads, 1);
});
