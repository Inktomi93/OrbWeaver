# Client RPG, regex, settings, and stats lane report

## Lane identity

- Lane: `client-rpg-settings`
- Semantic scope: assigned client regex/RPG/settings/stats source and mirrored unit/CT tests only.
- Snapshot commit: `c93253a3f907fb7fd93d411c511a98ed378505db`.
- Working-tree basis: byte-identical to the frozen assignment at both reconciliation points.
- Assigned files read: 134 / 134 (100%).
- Assigned lines read: 20,171 / 20,171 (100%).
- Assigned bytes read: 1,077,692 / 1,077,692 (100%).
- Dirty assigned paths: 0.
- Exclusions: shared architecture/testing law and AST implementation were read as prerequisites but not analyzed; no sibling-owned source, tests, configs, manifests, or audit artifacts were inspected as a finding scope.

## Read receipt

`read-receipt.tsv` reconciles all 134 assigned paths with current byte counts and SHA-256 hashes. Assignment-to-receipt drift: none.

## Architecture observed

- Regex member editing resolves the selected script via `regex.listScripts`, renders a deletion-safe empty state, and saves through `regex.updateScript` only after deriving tier flags at the client boundary ([regex-member-surface.tsx](/home/inktomi/inktomi-stack/development/orbweaver/packages/client/src/features/regex/surfaces/regex-member-surface.tsx:36), [regex-member-surface.tsx](/home/inktomi/inktomi-stack/development/orbweaver/packages/client/src/features/regex/surfaces/regex-member-surface.tsx:51)).
- RPG exposes its tab surface only through a common game predicate; game-tab query failures are contained and receive the host-aware error surface ([rpg-context-section.tsx](/home/inktomi/inktomi-stack/development/orbweaver/packages/client/src/features/rpg/lib/rpg-context-section.tsx:38), [rpg-context-section.tsx](/home/inktomi/inktomi-stack/development/orbweaver/packages/client/src/features/rpg/lib/rpg-context-section.tsx:60)).
- Settings shell chooses a surface body directly or composes its section nodes ([settings-shell-surface.tsx](/home/inktomi/inktomi-stack/development/orbweaver/packages/client/src/features/settings/surfaces/settings-shell-surface.tsx:431)). Stats supplies a user-recoverable no-data route to Chats ([analytics-overview-surface.tsx](/home/inktomi/inktomi-stack/development/orbweaver/packages/client/src/features/stats/surfaces/analytics-overview-surface.tsx:178)).

## Subsystem scorecards

| Subsystem (assigned denominator) | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Regex (17 source, 8 tests) | 4 | 3 | 5 | 0 | 3 | high | Member resolution/save boundary; 3 unit files/23 assertions plus 4 current CT files in the 229/229 pass. |
| RPG (53 source, 8 tests) | 4 | 3 | 5 | 0 | 3 | high | Context-tab predicate/error boundary; 1 unit file/3 assertions plus 6 current CT files in the 229/229 pass. |
| Settings (19 source, 8 tests) | 4 | 3 | 5 | 0 | 3 | high | Shell composition; 2 unit files/7 assertions plus 5 current CT files in the 229/229 pass. |
| Stats (16 source, 5 tests) | 4 | 3 | 5 | 0 | 3 | high | Overview empty-state/recompute paths; 1 unit file/21 assertions plus 3 current CT files in the 229/229 pass. |

Enforcement is scored 0 because no gate implementation/configuration is lane-owned. Verification reaches 5 through the current exact 18-file CT run; operability remains below live/e2e deployment proof.

## Findings

No source behavior, instrument, declared-not-wired, or test-quality defect is established by the completed evidence. The earlier CT pre-execution limitation was resolved by the coordinator's exact 18-file sanctioned run: 229/229 passed with zero failures, flakes, or skips. Resolution-aware orphan scans found no candidates in each owned source subtree; that is candidate-generating evidence, not an end-to-end proof.

## Proven strengths

- `previewRegexScript` carries real engine semantics through the unit tests: replacement counts, compile flags, macro ordering, trim behavior, macro-pattern substitution, and invalid-pattern handling are asserted ([regex-preview.test.ts](/home/inktomi/inktomi-stack/development/orbweaver/tests/client/features/regex/lib/regex-preview.test.ts:34)). R4; current lane unit result.
- Analytics view-model boundary behavior is meaningfully covered at unit tier: duration cutovers, compact values, ragged 7×24 heatmaps, and weekday mapping are asserted ([analytics-view-model.test.ts](/home/inktomi/inktomi-stack/development/orbweaver/tests/client/features/stats/lib/analytics-view-model.test.ts:28), [analytics-view-model.test.ts](/home/inktomi/inktomi-stack/development/orbweaver/tests/client/features/stats/lib/analytics-view-model.test.ts:88)). R4; current lane unit result.
- The exact 18-file browser scope currently passes 229/229, covering the assigned regex, RPG, settings, and stats rendered/tRPC boundary cases (R5).

## Declared versus completed

- Regex, RPG, settings, and stats declared surfaces have R2 declaration receipts from `pnpm ast exports`; direct composition/wiring reads lift the cited member editor, game tabs, settings shell, and analytics empty-state paths to R3.
- Seven owned unit files provide R4 proof for their focused behavior (54 current assertions total).
- All 18 owned CT files have a current exact execution receipt: 229/229 passed (R5).

## Tests and gates

Tests examined: unit 7, CT 18, integration 0, contract 0, e2e 0, type tests 0. The current exact unit command passed 54 tests. The current exact CT command passed 229/229 with zero failures, flakes, or skips; assertions cover route-tRPC and rendered-state behavior. Gate configuration belongs to another lane.

## Cross-lane edges

- Server RPC semantics and authorization behind regex/RPG/settings/stats calls are outside this lane; client receipts establish UI-side composition only.
- Live server authorization and e2e deployment remain outside the component-test boundary despite the current green CT receipt.

## Tool receipts

`pnpm ast` provided resolution-based exports/orphans/test-only lenses; orphan scans reported no results for all four owned source roots. The direct ast-grep negative scanned TS 34 and TSX 71 files, skipped 0 each, and `rg` independently found no `eval(` literal. Full command outcomes and the corrected AST failure are in `commands.md`.

## Lane verdict

All 134 assigned bytes were read and are still snapshot-identical. The client surfaces reviewed have concrete R3 composition seams, seven focused unit files pass at R4, and all 18 assigned CT files pass 229/229 at R5. No source or instrument defect is established. Live server/e2e behavior remains outside this lane.
