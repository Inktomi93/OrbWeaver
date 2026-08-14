# Commands — docs-design-mocks-panel

Working-tree basis: `dab3c8440f23ee23883897e446fe80e3838c9b29`; owned paths were clean at both initial and final hash checks.

## Read and receipt

- Read the audit controls, assignment, constitution, applicable architecture/testing/type references, and all 18 assigned mock artifacts (14,314 logical lines / 1,369,215 bytes).
- `sha256sum` and `wc -l -c` on every owned artifact. All 18 current SHA-256 values equal `assignment.txt`.
- Receipt denominator note: `wc -l` reports 14,298 because each of the 16 standalone HTML documents lacks a final LF; the assignment's logical-line convention counts the final unterminated line. Bytes and hashes reconcile exactly.

## Repository instrument

- `pnpm ast` — completed in 0.6s; read native usage and audit epilogue.
- `pnpm ast ident defineContextTabs --in packages/client --max 100` — 12 matches, 7 files; `scanned=933`, `skipped=3865(out-of-filter)`, `status=complete`.
- `pnpm ast ident ContextTabsPanel --in packages/client --max 100` — 3 matches, 2 files; `scanned=933`, `skipped=3865(out-of-filter)`, `status=complete`.
- `pnpm ast refs RpgActRail --in packages/client --max 100` — 3 matches, 2 files; `scanned=934`, `skipped=3974(out-of-filter)`, `status=complete`.

The following chained invocations exceeded the 30s command-yield window after completing their first recorded lens, so their later partial stdout was not used as negative evidence: `ident ContextTabsPanel; ident RpgContextSection; ident Waystone`, and `refs RpgActRail; refs RpgMapTab; refs RpgVeiledSection`.

## Focused current-source reads

- Read `packages/client/src/features/rpg/lib/rpg-context-section.tsx`, `rpg-header-band.tsx`, `rpg-map-tab.tsx`, `rpg-veiled-section.tsx`, and `rpg-act-rail.tsx` in full after the mock read barrier.
- `rg --files packages/client/src | rg 'rpg|tracker|context'` mapped referenced client files. This was location-only, not evidence for an absence claim.

## Safe documentation check

- `pnpm check:docs` — passed: `check:docs — 104 file(s) formatted` (2.9s).

## Exclusions

- No production source, tests, configs, gates, law, or sibling lane artifacts were modified.
