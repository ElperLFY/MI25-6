# Review findings and implementation notes

## Scope

The rewrite keeps the application static and separates the interface, stylesheet, application behavior, dataset definitions, CSV/ZIP parsing, and historical API client.

## Dataset support

The parser now recognises the supplied examples by normalized column names rather than positional column indexes:

- Fixed-network mapping 2025: `caratteristica`, `id_egon`, and the current regional CSV structure.
- PI1G 2025: `id_egon` and the PI1G address/coordinate structure.
- Fixed-network mapping 2021: `id_egon` or `cod_egon_civ`, `nome_com`, `indirunito`, `colore_26`, `peak_vel_down_26`, and `vel_max_down_26`.
- Proximity civics 2025: `cod_egon_civ`, the long 2024 private-coverage header, and `Coperto a giugno 2025`.
- FiberCop proximity civics 2025: the shared address fields plus `Ammissibile (SI/NO)` and `Cause esclusione`.

The optional `barrato` column may be absent or empty. Columns may be reordered. Unknown non-empty columns remain available in the result details. The 2021 fixed-survey data is published as 16 separate regional ZIP files directly under `data/fixed-2021/`; the loader has an explicit map for their actual uppercase filenames, including non-standard spellings for Friuli-Venezia Giulia, Trentino-Alto Adige, and Valle d'Aosta. The currently published folder does not contain files for Lombardia, Piemonte, Umbria, or Veneto. The proximity and FiberCop national ZIPs are published as `Italia.zip` with a capital I, and the loader now supports that exact case as a fallback after trying an individual region file.

Keeping the 2021 regional ZIPs separate is intentional: their combined existing compressed bytes total about 151.17 MiB, so a single `Italia.zip` would exceed GitHub's hard 100 MiB per-file limit in a normal Git repository. Each regional file is below the 25 MiB browser-upload cap, and the application only fetches the selected region.

## Record handling

The parser has no maximum record count. Appending records uses iterative loops, not argument spreading. Search results are no longer truncated to the first 40 matches. The autocomplete list remains intentionally limited to 40 suggestions for interface responsiveness; this does not discard or cap imported records or search results.

File and expanded-archive byte limits remain as protection against unexpectedly large uploads. They are not row/record limits.

## Semantic interpretation and presentation

The 2021 mapping's `colore_26`, `vel_max_down_26`, and `peak_vel_down_26` values are decoded using the reference legend from the original Handymenny frontend. Color codes are displayed as Bianco/Grigio/Nero. Speed numbers are decoded into their published threshold bands, with a separate mapping when the color column is absent. Unknown codes are identified as unknown rather than presented as physical speeds.

Search results identify the primary dataset in the heading, place the address immediately below it, and show the EGON identifier once. A missing match in the 2025 published outcomes is described as absence from that published subset, not as proof of no coverage.

## Automated checks

The suite now contains ten tests:

1. Proximity 2025, including the long header and missing `barrato`.
2. FiberCop proximity 2025, including an exported leading index column and an SNC suffix.
3. Fixed-network mapping 2021 and its three supplied `_26` fields.
4. Semantic interpretation of all 2021 speed classes, color codes, and the missing-color-column fallback.
5. Existing general 2025 and PI1G recognition and EGON-based search join.
6. A 150,000-record CSV import with exact record-count verification.
7. National ZIP containing uppercase regional ZIP files.
8. FiberCop type inference from eligibility/exclusion fields inside a regional ZIP.
9. Direct loading of a 2021 regional ZIP with its uploaded uppercase filename.
10. Regional lookup selecting only the matching nested regional archive, including the capitalized `Italia.zip` path.

JavaScript syntax checks and synthetic runtime smoke tests for the 2021 regional path, the unavailable-region flag, and capitalized `Italia.zip` fallback pass. A full `npm test` run in Node and a browser end-to-end run against GitHub Pages have not been performed in this environment.

## Remaining runtime verification

A browser end-to-end test against the deployed GitHub Pages site has not been performed in this environment. The owner must add the three national ZIP files, each containing its corresponding CSV file(s), before the new automatic regional data sources return results.
