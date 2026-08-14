## Lane identity

- Lane: `ui-primitives-s-z`
- Semantic scope: the 22 `@orb/ui` primitive seals from save-bar through virtual-list and their central mirrored Playwright CT files.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`.
- Working-tree basis: current bytes, closed at `189f2c71e76e16f947f6de7dd35634d7bffc9c0c`; 0 dirty assigned paths.
- Assigned files read: 96 / 96 (100%).
- Assigned lines read: 6,491 / 6,491 (100%).
- Assigned bytes read: 315,361 / 315,361 (100%).
- Exclusions: shared law/instrument prerequisites were read in full but are analysis-owned elsewhere; no sibling-lane source or tests were used as evidence.

## Read receipt

`read-receipt.tsv` covers every assignment row and current recomputation matches all 96 checksums. Assignment-to-receipt drift is zero; rolling audit drift is disclosed above (assignment snapshot differs from closing HEAD, but no assigned byte differs).

## Architecture observed

Each primitive exposes its sealed public surface from its local barrel, composes Base UI or the designated library, and keeps styling in a sibling `variants.ts`; CT imports the public `@orb/ui/<primitive>` surface rather than its implementation. Examples are the bundled ScrollArea anatomy at `packages/ui/src/primitives/scroll-area/scroll-area.tsx:29`, Select's sealed popup anatomy at `packages/ui/src/primitives/select/select.tsx:136`, and VirtualList's fixed virtualizer configuration at `packages/ui/src/primitives/virtual-list/virtual-list.tsx:96` (R3 through current CT imports, R5 where the CT behavior runs).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| save-bar, scroll-area, select, selection-bar, separator, series-row, skeleton | 4 | 4 | 4 | 2 | 4 | high | local barrels; 7 owned CT files; `reports/ct-report.json` (R5) |
| slider, sortable, spinner, status-chip, switch, table, tabs | 4 | 4 | 4 | 2 | 4 | high | local barrels; 7 owned CT files; `reports/ct-report.json` (R5) |
| text, textarea, toast, toggle-group, toggle, tool-call-block, tooltip | 4 | 4 | 4 | 2 | 4 | high | local barrels; 7 owned CT files; `reports/ct-report.json` (R5) |
| virtual-list | 4 | 4 | 3 | 2 | 4 | high | `packages/ui/src/primitives/virtual-list/virtual-list.tsx:70`; `tests/ui/primitives/virtual-list/virtual-list.ct.tsx:11`; finding below (R5/R4) |

Scores are restricted to the 96 assigned files. Enforcement is 2 because this lane established package seals and current behavioral tests, not a proven positive-controlled gate for every primitive invariant.

## Findings

### `UI-SZ-01` — VirtualList's append and edge-cue APIs have no behavioral CT coverage

- Severity: P2
- Class: declared-not-tested
- Confidence: high; it would rise no further without a passing test because the missing proof is the issue.
- Evidence rung: R2 for the declared API, R3 for implementation, R5 for the executed partial CT suite.
- Scope denominator: 2 mirrored VirtualList test files, 234 lines and 9,483 bytes; literal `rg` found all 18 `onEndApproach`/`scrollToIndex`/`fadeEdge` references only in `packages/ui/src/primitives/virtual-list/virtual-list.tsx`, while full reads of `tests/ui/primitives/virtual-list/virtual-list.ct.tsx:1` and `tests/ui/primitives/virtual-list/virtual-list.fixtures.tsx:1` found no exercised path. The attempted repository-native structural lenses are recorded as capture failures in `commands.md`, not claimed as clean evidence.
- Receipts: `scrollToIndex`/`onEndApproach` are declared at `packages/ui/src/primitives/virtual-list/virtual-list.tsx:37` and `packages/ui/src/primitives/virtual-list/virtual-list.tsx:39`, then execute at `packages/ui/src/primitives/virtual-list/virtual-list.tsx:120` and `packages/ui/src/primitives/virtual-list/virtual-list.tsx:143`; `fadeEdge` is declared at `packages/ui/src/primitives/virtual-list/virtual-list.tsx:55` and mutates `data-more` at `packages/ui/src/primitives/virtual-list/virtual-list.tsx:134` and `packages/ui/src/primitives/virtual-list/virtual-list.tsx:159`. Existing CT covers windowing, manual scroll, the bounded-height throw, derived inputs, lanes, and rangeExtractor at `tests/ui/primitives/virtual-list/virtual-list.ct.tsx:11` through `tests/ui/primitives/virtual-list/virtual-list.ct.tsx:71`; the all-owned run passed 188 tests (R5).
- Established fact: the three declared branches can regress without an owned assertion, including tail-fetch triggering, end-aligned auto-scroll, and removal of the bottom cue at list end.
- User or system impact: a caller can ship a list that no longer fetches its next page, no longer follows an appended item, or misleadingly still signals more content after the tail.
- What remains unverified: exact invocation timing/deduplication for `onEndApproach`, reduced-motion behavior for `scrollToIndex`, and both `data-more` transitions.
- Suggested next check or fix: add one compact CT fixture that supplies the three props, then assert end-approach after scrolling near tail, scroll position after a changed `scrollToIndex`, and `data-more` before versus at bottom.

## Proven strengths

- The 22 owned CT files exercised the public barrel surfaces in Chromium: 188 expected tests passed with no failures, flakes, or skips in the current canonical JSON (`reports/ct-report.json`, R5).
- VirtualList's existing suite meaningfully proves bounded-window rendering, scroll reachability, its unbounded-height failure path, derived items, lane passthrough, and custom range extraction at `tests/ui/primitives/virtual-list/virtual-list.ct.tsx:11` through `tests/ui/primitives/virtual-list/virtual-list.ct.tsx:71` (R5).

## Declared versus completed

All 22 component surfaces are declared and CT-mounted through their public barrels (R4/R5). The virtual-list append/auto-scroll/fade-edge branches are implemented but only R3 in their own right; `UI-SZ-01` identifies the missing R4/R5 coverage.

## Tests and gates

22 CT files and 7 non-executable fixture modules were read. The exact owned CT command passed 188/188 in 17.2 seconds; the canonical JSON reported zero unexpected, skipped, or flaky tests. This is behavioral browser evidence, not a static-green substitution. No whole-tree gate was run because it is outside the lane's assigned verification scope.

## Cross-lane edges

The detached-output behavior of long typed `pnpm ast` lenses is an `instrument-defect` candidate for the codemod/verification-harness owners; this lane makes no assertion about the lens results. See `commands.md`.

## Tool receipts

`pnpm ast` bare completed (2.0s, exit 0). Broad and narrow repository-native structural runs are listed with their detached-output failure, durations, and scope in `commands.md`; independent literal cross-check scope was the two virtual-list test files plus the implementation. CT canonical artifacts were read immediately after the zero exit.

## Lane verdict

The assigned primitive seals are implemented and each has current browser CT coverage through its public surface: 188 current assertions passed. No owned byte drifted from the assignment snapshot. VirtualList has one bounded proof gap: three documented runtime branches lack a direct behavioral assertion. The largest uncertainty is therefore not basic reachability but regression protection for append, autoscroll, and fade-edge behavior.
