import { normalise } from "./normalization.js";

function forEachRecord(groupsOrRecords, callback) {
  if (!Array.isArray(groupsOrRecords)) return;
  const groups = groupsOrRecords.length && Array.isArray(groupsOrRecords[0])
    ? groupsOrRecords
    : [groupsOrRecords];
  for (const records of groups) {
    for (const record of records) {
      if (callback(record) === false) return false;
    }
  }
  return true;
}

function matches(record, query) {
  if (query.region && !record.normalisedRegion.startsWith(query.region)) return false;
  if (query.province && !record.normalisedProvince.includes(query.province)) return false;
  if (query.city && !record.normalisedCity.includes(query.city)) return false;
  if (query.street
    && !record.normalisedStreet.includes(query.street)
    && !record.normalisedFullAddress.includes(query.street)) return false;

  if (query.number) {
    const numberMatches = record.normalisedNumber === query.number
      || record.normalisedFullNumber === query.number
      || (query.number === "SNC" && ["", "0"].includes(record.normalisedNumber))
      || (!record.normalisedNumber && record.normalisedFullAddress.includes(query.number));
    if (!numberMatches) return false;
  }

  return true;
}

function getResult(results, record) {
  let result = results.get(record.key);
  if (!result) {
    result = { id: record.id, general: null, pi1g: null, datasets: {} };
    results.set(record.key, result);
  }
  return result;
}

export function searchRecords(general, pi1g, extra, query) {
  const results = new Map();

  for (const record of general) {
    if (matches(record, query)) getResult(results, record).general = record;
  }
  for (const record of pi1g) {
    if (matches(record, query)) getResult(results, record).pi1g = record;
  }
  for (const [key, records] of Object.entries(extra || {})) {
    for (const record of records) {
      if (!matches(record, query)) continue;
      const result = getResult(results, record);
      if (!result.datasets[key]) result.datasets[key] = [];
      result.datasets[key].push(record);
    }
  }

  return Array.from(results.values());
}

export function collectRecords(general, pi1g, extra) {
  const records = [];
  for (const record of general) records.push(record);
  for (const record of pi1g) records.push(record);
  for (const values of Object.values(extra || {})) {
    for (const record of values) records.push(record);
  }
  return records;
}

export function cityIsKnown(general, pi1g, extra, city, region = "") {
  const query = normalise(city);
  const selectedRegion = normalise(region);
  const lists = [general, pi1g];
  for (const records of Object.values(extra || {})) lists.push(records);

  let found = false;
  forEachRecord(lists, (record) => {
    if (record.normalisedCity.includes(query)
      && (!selectedRegion || record.normalisedRegion.startsWith(selectedRegion))) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

function sortSuggestionValues(values) {
  return Array.from(values).sort((first, second) => {
    const firstNumber = Number.parseInt(first, 10);
    const secondNumber = Number.parseInt(second, 10);
    if (Number.isNaN(firstNumber) || Number.isNaN(secondNumber) || firstNumber === secondNumber) {
      return first.localeCompare(second, "it");
    }
    return firstNumber - secondNumber;
  });
}

export function getSuggestions(field, search, state, records, cache = null) {
  const query = normalise(search);
  const fieldNames = { province: "province", city: "city", street: "street" };
  const selected = {
    region: normalise(state.region),
    province: field === "province" ? "" : normalise(state.province),
    city: field === "city" ? "" : normalise(state.city),
    street: field === "street" ? "" : normalise(state.street)
  };
  const cacheKey = [
    field, selected.region, selected.province, selected.city, selected.street
  ].join("\u001f");

  let candidates = cache?.get(cacheKey);
  if (!candidates) {
    const values = new Set();
    forEachRecord(records, (record) => {
      if (selected.region && !record.normalisedRegion.startsWith(selected.region)) return;
      if (selected.province && !record.normalisedProvince.includes(selected.province)) return;
      if (selected.city && !record.normalisedCity.includes(selected.city)) return;
      if (selected.street && !record.normalisedStreet.includes(selected.street)) return;

      let value = "";
      if (field === "number") {
        value = !record.normalisedNumber || record.normalisedNumber === "0"
          ? "SNC"
          : record.number + (record.suffix ? "/" + record.suffix : "");
      } else {
        value = record[fieldNames[field]] ?? "";
      }
      if (value) values.add(value);
    });

    candidates = sortSuggestionValues(values);
    // Cache only bounded option lists. A broad street/number query can have
    // hundreds of thousands of distinct values and should not retain them.
    if (cache && candidates.length <= 20_000) {
      if (cache.size >= 48) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, candidates);
    }
  }

  if (!query) return candidates.slice();
  return candidates.filter((value) => {
    const normalizedValue = normalise(value);
    return normalizedValue.startsWith(query) || normalizedValue.includes(" " + query);
  });
}
