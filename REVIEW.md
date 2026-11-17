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

The optional `barrato` column may be absent or empty. Columns may be reordered. Unknown non-empty columns remain available in the result details. The national ZIP archives for the three new dataset types are expected at `data/fixed-2021/italia.zip`, `data/proximity-2025/italia.zip`, and `data/fibercop-proximity-2025/italia.zip`.

The original regional archives are retained as ZIP blobs and moved under `data/fixed-2025/` and `data/pi1g-2025/` in the repository tree. No user-supplied CSV archives are fabricated; the three new dataset folders contain instructions and are ready for the owner to add `italia.zip`.

## Record handling

The parser has no maximum record count. Appending records uses iterative loops, not argument spreading. Search results are no longer truncated to the first 40 matches. The autocomplete list remains intentionally limited to 40 suggestions for interface responsiveness; this does not discard or cap imported records or search results.

File and expanded-archive byte limits remain as protection against unexpectedly large uploads. They are not row/record limits.

## Automated checks

`npm test` passes five tests:

1. Proximity 2025, including the long header and missing `barrato`.
2. FiberCop proximity 2025, including an exported leading index column and an SNC suffix.
3. Fixed-network mapping 2021 and its three supplied `_26` fields.
4. Existing general 2025 and PI1G recognition and EGON-based search join.
5. A 150,000-record CSV import with exact record-count verification.

All JavaScript modules pass `node --check`.

## Remaining runtime verification

A browser end-to-end test against the deployed GitHub Pages site has not been performed in this environment. The owner must add the three national ZIP files, each containing its corresponding CSV file(s), before the new automatic regional data sources return results.
