export function createAutocompleteController({
  $, getSuggestions, findCityRecord, normalise,
  currentSearchState, renderOptions, suggestionValues
}) {
  const suggestionTimers = {};
  const suggestionRequestTokens = { province: 0, city: 0, street: 0, number: 0 };
function updateFieldHint(field, inputValue, values) {
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

const suggestionRequestTokens = { province: 0, city: 0, street: 0, number: 0 };

async function updateSuggestions(field, token = suggestionRequestTokens[field]) {
  const mapping = {
    province: ["province", "province-options"],
    city: ["city", "city-options"],
    street: ["street", "street-options"],
    number: ["street-number", "number-options"]
  };
  const [inputId, listId] = mapping[field];
  const input = $(inputId);
  const typed = input.value;
  const values = await getSuggestions(field, typed, currentSearchState());
  if (token !== suggestionRequestTokens[field] || input.value !== typed) return;
  suggestionValues[field] = values.slice(0, 40);
  renderOptions(listId, suggestionValues[field]);
  updateFieldHint(field, typed, values);
}

function scheduleSuggestions(field) {
  suggestionRequestTokens[field] += 1;
  const token = suggestionRequestTokens[field];
  window.clearTimeout(suggestionTimers[field]);
  suggestionTimers[field] = window.setTimeout(() => {
    updateSuggestions(field, token).catch((error) => {
      if (token === suggestionRequestTokens[field]) $(field + "-hint").textContent = error.message || "Suggerimenti temporaneamente non disponibili.";
    });
  }, 120);
}

async function handleAutocompleteEnter(field, event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const inputId = field === "number" ? "street-number" : field;
  const input = $(inputId);
  const typed = input.value.trim();
  if (!typed && field !== "number") return;

  try {
    const values = typed ? (await getSuggestions(field, typed, currentSearchState())).slice(0, 40) : (suggestionValues[field] || []);
    suggestionValues[field] = values;
    const normalized = normalise(typed);
    const selected = normalized
      ? values.find((value) => normalise(value) === normalized)
        || values.find((value) => normalise(value).startsWith(normalized))
        || (values.length === 1 ? values[0] : null)
      : null;
    if (selected) input.value = selected;
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


  return { scheduleSuggestions, handleAutocompleteEnter, suggestionValues };
}
