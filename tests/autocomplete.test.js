import test from "node:test";
import assert from "node:assert/strict";
import { createAutocompleteController } from "../JS/controllers/autocomplete.js";

class FakeClassList {
  constructor() { this.values = new Set(); }
  toggle(name, force) {
    if (force) this.values.add(name);
    else this.values.delete(name);
  }
}

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.value = "";
    this.textContent = "";
    this.hidden = false;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.dataset = {};
    this.classList = new FakeClassList();
    this.parentElement = null;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, callback) {
    (this.listeners[name] ||= []).push(callback);
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = [...children]; }
  dispatchEvent(event) {
    for (const callback of this.listeners[event.type] || []) callback(event);
    return true;
  }
  focus() { globalThis.document.activeElement = this; }
  scrollIntoView() {}
}

test("autocomplete suggestions render as a themed combobox and support keyboard selection", async () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const elements = new Map();
  const fields = ["region", "province", "city", "street", "street-number"];
  const labels = ["region", "province", "city", "street", "number"];

  for (const field of fields) {
    const input = new FakeElement(field);
    const popup = new FakeElement(field + "-suggestions");
    const trigger = new FakeElement(field + "-trigger");
    const control = new FakeElement(field + "-control");
    trigger.parentElement = control;
    control.querySelector = (selector) => selector === ".autocomplete-trigger" ? trigger : null;
    elements.set(field, input);
    elements.set(field + "-suggestions", popup);
    elements.set(field + "-trigger", trigger);
    elements.set(field + "-control", control);
    input.parentElement = control;
  }
  for (const field of ["region", "province", "city", "street", "number"]) {
    elements.set(field + "-hint", new FakeElement(field + "-hint"));
  }
  elements.set("search-form", { requestSubmit() {} });
  elements.set("data-status", new FakeElement("data-status"));

  globalThis.document = {
    activeElement: null,
    createElement: () => new FakeElement()
  };
  globalThis.window = {
    setTimeout,
    clearTimeout
  };

  try {
    const suggestionValues = {
      region: [], province: [], city: [], street: [], number: []
    };
    const $ = (id) => {
      if (id === "street-number") return elements.get("street-number");
      return elements.get(id);
    };
    const controller = createAutocompleteController({
      $,
      suggestionValues,
      normalise: (value) => String(value).trim().toUpperCase(),
      currentSearchState: () => ({}),
      staticOptions: { region: ["SICILIA", "SARDEGNA"] },
      getSuggestions: async (field) => field === "province" ? ["AGRIGENTO", "ENNA"] : [],
      findCityRecord: async () => null
    });

    const input = elements.get("province");
    const popup = elements.get("province-suggestions");
    document.activeElement = input;
    controller.scheduleSuggestions("province");
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.equal(popup.hidden, false);
    assert.equal(popup.children.length, 2);
    assert.equal(popup.children[0].textContent, "AGRIGENTO");
    assert.equal(input.attributes.role, "combobox");
    assert.equal(input.attributes["aria-expanded"], "true");

    let prevented = false;
    controller.handleSuggestionKeydown("province", {
      key: "ArrowDown",
      preventDefault() { prevented = true; }
    });
    assert.equal(prevented, true);
    assert.equal(controller.getActiveSuggestion("province"), "AGRIGENTO");

    controller.handleSuggestionKeydown("province", {
      key: "ArrowDown",
      preventDefault() {}
    });
    assert.equal(controller.getActiveSuggestion("province"), "ENNA");

    controller.selectSuggestion("province", "AGRIGENTO");
    assert.equal(input.value, "AGRIGENTO");
    assert.equal(popup.hidden, true);
    assert.equal(input.attributes["aria-expanded"], "false");

    document.activeElement = elements.get("region");
    controller.scheduleSuggestions("region");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.deepEqual(suggestionValues.region, ["SICILIA", "SARDEGNA"]);
    assert.equal(elements.get("region-suggestions").children.length, 2);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});
