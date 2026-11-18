const FIELD_CONFIG = {
  region: { inputId: "region", popupId: "region-suggestions", triggerLabel: "Regione" },
  province: { inputId: "province", popupId: "province-suggestions", triggerLabel: "Provincia" },
  city: { inputId: "city", popupId: "city-suggestions", triggerLabel: "Città" },
  street: { inputId: "street", popupId: "street-suggestions", triggerLabel: "Via" },
  number: { inputId: "street-number", popupId: "street-number-suggestions", triggerLabel: "Civico" }
};

export function createAutocompleteController({
  $, getSuggestions, findCityRecord, normalise,
  currentSearchState, suggestionValues, staticOptions = {}
}) {
  const suggestionTimers = {};
  const suggestionRequestTokens = Object.fromEntries(
    Object.keys(FIELD_CONFIG).map((field) => [field, 0])
  );
  const activeSuggestionIndexes = Object.fromEntries(
    Object.keys(FIELD_CONFIG).map((field) => [field, -1])
  );

  function getInput(field) {
    return $(FIELD_CONFIG[field].inputId);
  }

  function getPopup(field) {
    return $(FIELD_CONFIG[field].popupId);
  }

  function getTrigger(field) {
    return getInput(field).parentElement?.querySelector(".autocomplete-trigger");
  }

  function setExpanded(field, expanded) {
    const input = getInput(field);
    const popup = getPopup(field);
    const trigger = getTrigger(field);
    input.setAttribute("aria-expanded", String(expanded));
    if (trigger) trigger.setAttribute("aria-expanded", String(expanded));
    if (popup) popup.hidden = !expanded;
    if (!expanded) {
      input.removeAttribute("aria-activedescendant");
      activeSuggestionIndexes[field] = -1;
    }
  }

  function closeSuggestions(field) {
    if (!FIELD_CONFIG[field]) return;
    setExpanded(field, false);
  }

  function showSuggestions(field) {
    const popup = getPopup(field);
    if (!popup || !popup.children.length) {
      closeSuggestions(field);
      return;
    }
    setExpanded(field, true);
  }

  function updateActiveOption(field) {
    const popup = getPopup(field);
    const input = getInput(field);
    const activeIndex = activeSuggestionIndexes[field];

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

  function selectSuggestion(field, value) {
    if (!FIELD_CONFIG[field] || value === undefined || value === null) return;
    const input = getInput(field);
    input.value = String(value);
    closeSuggestions(field);

    const hint = $(field + "-hint");
    if (hint && field === "region") {
      hint.textContent = input.value + " · Regione selezionata.";
    }

    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function renderSuggestionOptions(field, values, shouldOpen) {
    const popup = getPopup(field);
    popup.replaceChildren();

    values.forEach((value, index) => {
      const option = document.createElement("div");
      option.id = FIELD_CONFIG[field].inputId + "-suggestion-" + index;
      option.className = "autocomplete-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.dataset.value = String(value);
      option.textContent = String(value);
      option.addEventListener("pointerdown", (event) => event.preventDefault());
      option.addEventListener("click", () => selectSuggestion(field, value));
      popup.appendChild(option);
    });

    activeSuggestionIndexes[field] = -1;
    if (shouldOpen && values.length) showSuggestions(field);
    else closeSuggestions(field);
  }

  function updateFieldHint(field, inputValue, values) {
    if (field === "region") return;
    const hint = $(field + "-hint");
    if (!hint) return;
    const typed = String(inputValue || "").trim();

    if (!typed && field !== "number") {
      hint.textContent = "";
      return;
    }
    if (!typed && field === "number") {
      if (!$("street").value.trim()) {
        hint.textContent = "";
        return;
      }
      hint.textContent = values.length
        ? "Civico facoltativo · " + values.length.toLocaleString("it-IT") + " opzioni disponibili."
        : "Inserisci il civico oppure lascia il campo vuoto.";
      return;
    }

    if (values.length) {
      const count = values.length > 40 ? "40+" : values.length.toLocaleString("it-IT");
      hint.textContent = count + " suggerimenti · premi Invio per selezionare il primo.";
    } else {
      hint.textContent = "Nessun suggerimento corrispondente · puoi comunque inserire il valore manualmente.";
    }
  }

  async function fetchFieldSuggestions(field, typed) {
    if (field === "region") {
      const query = normalise(typed);
      return (staticOptions.region || []).filter((value) => !query || normalise(value).startsWith(query));
    }
    return getSuggestions(field, typed, currentSearchState());
  }

  async function updateSuggestions(field, token = suggestionRequestTokens[field]) {
    const input = getInput(field);
    const typed = input.value;
    const values = await fetchFieldSuggestions(field, typed);
    if (token !== suggestionRequestTokens[field] || input.value !== typed) return;

    suggestionValues[field] = values.slice(0, 40);
    renderSuggestionOptions(
      field,
      suggestionValues[field],
      document.activeElement === input
    );
    updateFieldHint(field, typed, values);
  }

  function scheduleSuggestions(field) {
    if (!FIELD_CONFIG[field]) return;
    suggestionRequestTokens[field] += 1;
    const token = suggestionRequestTokens[field];
    window.clearTimeout(suggestionTimers[field]);
    suggestionTimers[field] = window.setTimeout(() => {
      updateSuggestions(field, token).catch((error) => {
        if (token === suggestionRequestTokens[field]) {
          const hint = $(field + "-hint");
          if (hint) hint.textContent = error.message || "Suggerimenti temporaneamente non disponibili.";
          closeSuggestions(field);
        }
      });
    }, 120);
  }

  function handleSuggestionKeydown(field, event) {
    const values = suggestionValues[field] || [];
    if (event.key === "Escape") {
      if (!getPopup(field).hidden) {
        event.preventDefault();
        closeSuggestions(field);
        return true;
      }
      return false;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return false;
    if (!values.length) return false;

    event.preventDefault();
    if (getPopup(field).hidden) showSuggestions(field);
    const current = activeSuggestionIndexes[field];
    const next = event.key === "ArrowDown"
      ? (current + 1 + values.length) % values.length
      : (current <= 0 ? values.length - 1 : current - 1);
    activeSuggestionIndexes[field] = next;
    updateActiveOption(field);
    return true;
  }

  function getActiveSuggestion(field) {
    const index = activeSuggestionIndexes[field];
    return index >= 0 ? suggestionValues[field]?.[index] : null;
  }

  async function handleAutocompleteEnter(field, event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const input = getInput(field);
    const typed = input.value.trim();
    if (!typed && field !== "number") return;

    try {
      const activeValue = getActiveSuggestion(field);
      const values = activeValue
        ? (suggestionValues[field] || [])
        : typed
          ? (await fetchFieldSuggestions(field, typed)).slice(0, 40)
          : (suggestionValues[field] || []);
      suggestionValues[field] = values;
      const normalized = normalise(typed);
      const selected = activeValue || (normalized
        ? values.find((value) => normalise(value) === normalized)
          || values.find((value) => normalise(value).startsWith(normalized))
          || (values.length === 1 ? values[0] : null)
        : null);

      if (selected) input.value = selected;
      closeSuggestions(field);

      if (field === "city") {
        const record = await findCityRecord(input.value);
        if (record && !$("province").value) $("province").value = record.province;
      }
      if (field === "number") {
        $("search-form").requestSubmit();
        return;
      }
      const next = ({ province: "city", city: "street", street: "number" })[field];
      if (!next) return;
      const nextInput = next === "number" ? $("street-number") : $(next);
      scheduleSuggestions(next);
      nextInput.focus();
    } catch (error) {
      $("data-status").textContent = error.message || "Impossibile recuperare i suggerimenti.";
    }
  }

  function bindCombobox(field) {
    const input = getInput(field);
    const popup = getPopup(field);
    const trigger = getTrigger(field);
    const label = FIELD_CONFIG[field].triggerLabel;

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-haspopup", "listbox");
    input.setAttribute("aria-controls", popup.id);
    input.setAttribute("aria-expanded", "false");
    popup.setAttribute("role", "listbox");
    popup.setAttribute("aria-label", "Suggerimenti " + label);
    popup.hidden = true;

    input.addEventListener("focus", () => scheduleSuggestions(field));
    input.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (document.activeElement !== trigger) closeSuggestions(field);
      }, 100);
    });

    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-label", "Mostra suggerimenti " + label);
      trigger.addEventListener("pointerdown", (event) => event.preventDefault());
      trigger.addEventListener("click", () => {
        const wasOpen = !popup.hidden;
        input.focus();
        if (wasOpen) closeSuggestions(field);
        else if (suggestionValues[field]?.length) renderSuggestionOptions(field, suggestionValues[field], true);
        else scheduleSuggestions(field);
      });
      trigger.addEventListener("blur", () => {
        window.setTimeout(() => {
          if (document.activeElement !== input) closeSuggestions(field);
        }, 100);
      });
    }
  }

  Object.keys(FIELD_CONFIG).forEach(bindCombobox);

  return {
    scheduleSuggestions,
    handleAutocompleteEnter,
    handleSuggestionKeydown,
    getActiveSuggestion,
    selectSuggestion,
    closeSuggestions,
    suggestionValues
  };
}
