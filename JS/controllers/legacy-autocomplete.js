const FIELD_CONFIG = {
  region: { inputId: "legacy-region", popupId: "legacy-region-suggestions", label: "Regione" },
  province: { inputId: "legacy-province", popupId: "legacy-province-suggestions", label: "Provincia" },
  city: { inputId: "legacy-city", popupId: "legacy-city-suggestions", label: "Città" },
  street: { inputId: "legacy-street", popupId: "legacy-street-suggestions", label: "Via" },
  number: { inputId: "legacy-number", popupId: "legacy-number-suggestions", label: "Civico" }
};

const MAX_VISIBLE_OPTIONS = 40;

export function createLegacyAutocomplete({ $, normalise, onSelect }) {
  const sourceOptions = Object.fromEntries(Object.keys(FIELD_CONFIG).map((key) => [key, []]));
  const visibleOptions = Object.fromEntries(Object.keys(FIELD_CONFIG).map((key) => [key, []]));
  const activeIndexes = Object.fromEntries(Object.keys(FIELD_CONFIG).map((key) => [key, -1]));

  function getInput(key) { return $(FIELD_CONFIG[key].inputId); }
  function getPopup(key) { return $(FIELD_CONFIG[key].popupId); }
  function getTrigger(key) { return getInput(key).parentElement?.querySelector(".autocomplete-trigger"); }
  function optionValue(key, item) { return key === "number" ? String(item?.number ?? "") : String(item ?? ""); }
  function optionSearchText(key, item) {
    return key === "number" ? optionValue(key, item) + " " + String(item?.egon ?? "") : optionValue(key, item);
  }

  function setExpanded(key, expanded) {
    const input = getInput(key);
    const popup = getPopup(key);
    const trigger = getTrigger(key);
    input.setAttribute("aria-expanded", String(expanded));
    if (trigger) trigger.setAttribute("aria-expanded", String(expanded));
    popup.hidden = !expanded;
    if (!expanded) {
      input.removeAttribute("aria-activedescendant");
      activeIndexes[key] = -1;
    }
  }

  function close(key) {
    if (FIELD_CONFIG[key]) setExpanded(key, false);
  }

  function updateActive(key) {
    const input = getInput(key);
    const popup = getPopup(key);
    const activeIndex = activeIndexes[key];
    Array.from(popup.children).forEach((option, index) => {
      const selected = index === activeIndex;
      option.classList.toggle("is-active", selected);
      option.setAttribute("aria-selected", String(selected));
      if (selected) {
        input.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView?.({ block: "nearest" });
      }
    });
    if (activeIndex < 0) input.removeAttribute("aria-activedescendant");
  }

  function choose(key, item) {
    const value = optionValue(key, item);
    if (!value) return;
    getInput(key).value = value;
    close(key);
    onSelect(key, item);
  }

  function render(key, shouldOpen = true) {
    const input = getInput(key);
    const popup = getPopup(key);
    const query = normalise(input.value);
    const matches = sourceOptions[key].filter((item) =>
      !query || normalise(optionSearchText(key, item)).includes(query)
    );
    const limited = matches.slice(0, MAX_VISIBLE_OPTIONS);
    visibleOptions[key] = limited;
    popup.replaceChildren();

    limited.forEach((item, index) => {
      const option = document.createElement("div");
      option.id = FIELD_CONFIG[key].inputId + "-suggestion-" + index;
      option.className = "autocomplete-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.dataset.value = optionValue(key, item);

      const label = document.createElement("span");
      label.className = "autocomplete-option-label";
      label.textContent = optionValue(key, item);
      option.appendChild(label);

      if (key === "number" && item?.egon !== undefined) {
        const meta = document.createElement("small");
        meta.className = "autocomplete-option-meta";
        meta.textContent = "ID EGON: " + String(item.egon);
        option.appendChild(meta);
      }

      option.addEventListener("pointerdown", (event) => event.preventDefault());
      option.addEventListener("click", () => choose(key, item));
      popup.appendChild(option);
    });

    activeIndexes[key] = -1;
    if (shouldOpen && limited.length && !input.disabled) setExpanded(key, true);
    else close(key);
  }

  function setOptions(key, items) {
    if (!FIELD_CONFIG[key]) return;
    sourceOptions[key] = Array.isArray(items) ? items.slice() : [];
    const input = getInput(key);
    render(key, document.activeElement === input && !input.disabled);
  }

  function clear(key) {
    if (!FIELD_CONFIG[key]) return;
    sourceOptions[key] = [];
    visibleOptions[key] = [];
    getPopup(key).replaceChildren();
    close(key);
  }

  function setDisabled(key, disabled) {
    if (!FIELD_CONFIG[key]) return;
    const value = Boolean(disabled);
    getInput(key).disabled = value;
    const trigger = getTrigger(key);
    if (trigger) trigger.disabled = value;
    if (value) close(key);
  }

  function bind(key) {
    const input = getInput(key);
    const popup = getPopup(key);
    const trigger = getTrigger(key);
    const wrapper = input.parentElement;
    const label = FIELD_CONFIG[key].label;

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-haspopup", "listbox");
    input.setAttribute("aria-controls", popup.id);
    input.setAttribute("aria-expanded", "false");
    popup.setAttribute("role", "listbox");
    popup.setAttribute("aria-label", "Suggerimenti " + label);
    popup.hidden = true;
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-label", "Mostra suggerimenti " + label);
    }

    input.addEventListener("focus", () => render(key, true));
    input.addEventListener("input", () => render(key, true));
    input.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (!wrapper?.contains(document.activeElement)) close(key);
      }, 120);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!popup.hidden) {
          event.preventDefault();
          close(key);
        }
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!visibleOptions[key].length) return;
        event.preventDefault();
        if (popup.hidden) setExpanded(key, true);
        const current = activeIndexes[key];
        activeIndexes[key] = event.key === "ArrowDown"
          ? (current + 1) % visibleOptions[key].length
          : (current <= 0 ? visibleOptions[key].length - 1 : current - 1);
        updateActive(key);
        return;
      }

      if (event.key !== "Enter") return;
      const active = activeIndexes[key] >= 0 ? visibleOptions[key][activeIndexes[key]] : null;
      if (active) {
        event.preventDefault();
        choose(key, active);
        return;
      }

      const typed = normalise(input.value);
      if (key === "number") {
        if (typed) {
          event.preventDefault();
          close(key);
          onSelect(key, input.value);
        }
        return;
      }

      const selected = typed
        ? visibleOptions[key].find((item) => normalise(optionValue(key, item)) === typed)
          || visibleOptions[key].find((item) => normalise(optionValue(key, item)).startsWith(typed))
          || (visibleOptions[key].length === 1 ? visibleOptions[key][0] : null)
        : null;
      if (selected) {
        event.preventDefault();
        choose(key, selected);
      }
    });

    if (trigger) {
      trigger.addEventListener("pointerdown", (event) => event.preventDefault());
      trigger.addEventListener("click", () => {
        const wasOpen = !popup.hidden;
        input.focus();
        if (wasOpen) close(key);
        else render(key, true);
      });
    }
  }

  return { bind, setOptions, clear, setDisabled, close };
}
