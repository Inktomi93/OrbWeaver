# Lane identity

- Lane: `ui-primitives-j-r`
- Semantic scope: kbd through reveal-gate `@orb/ui` primitives and their central-tree mirrors.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`.
- Working-tree basis: rolling snapshot; the final owned checksum reconciliation exactly matches the assignment snapshot (no owned-path drift).
- Assigned files read: 63 / 63.
- Assigned lines read: 7,150 / 7,150.
- Assigned bytes read: 344,742 / 344,742.
- Dirty assigned paths at initial check: 0; audit artifacts were initially untracked as a lane directory.
- Exclusions: no sibling-owned code or tests inspected as audit evidence.

## Read receipt

`read-receipt.tsv` contains all 63 OWNED paths from `assignment.txt`, with current lines, bytes, and SHA-256 values. All match the dispatch snapshot; there is no assignment-to-receipt drift.

## Architecture observed

The audited modules are sealed, domain-agnostic `@orb/ui` subpath primitives; their public doors are local `index.ts` barrels. The component tests mirror source in `tests/ui/primitives/**`, as required by the central test-tree law. `ListRow` demonstrates the intended accessibility boundary: a clickable body is a native button while trailing actions remain sibling controls ([packages/ui/src/primitives/list-row/list-row.tsx](/home/inktomi/inktomi-stack/development/orbweaver/packages/ui/src/primitives/list-row/list-row.tsx:276), [tests/ui/primitives/list-row/list-row.ct.tsx](/home/inktomi/inktomi-stack/development/orbweaver/tests/ui/primitives/list-row/list-row.ct.tsx:43)). Evidence R5: the owned CT run passed 177 tests.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| kbd, list-row, log-viewer, macro-textarea, media-grid, menu, message-list, number-field, option-strip, popover, progress, radio-group, reveal-gate | 4 | 3 | 5 | 3 | 4 | high | 63-path receipt; 177/177 CT R5; 22/22 unit R4; package subpath/barrel structure R2 |

## Findings

No defect finding was established in the owned scope. The completed resolution-based `orphans ui` lens scanned 308 typed UI files and returned six candidates, including lane-owned public `MenuHandle` and `PopoverHandle` types (`packages/ui/src/primitives/menu/handle.ts:9`; `packages/ui/src/primitives/popover/handle.ts:7`). Public API intent and external consumers are outside this lane, so those candidates are not promoted to defects.

## Proven strengths

- **R5 — browser behavioral coverage:** all 13 owned executable component-test files passed, 177 tests total, with no failures, skips, or flakes (`reports/ct-report.json`, canonical summary recorded in `commands.md`).
- **R4 — pure logic coverage:** macro trigger/insert and message-list pin-spacer behavior passed 22 focused unit tests (`tests/ui/primitives/macro-textarea/macro-textarea-logic.test.ts`, `tests/ui/primitives/message-list/pin-spacer.test.ts`).
- **R5 — semantic row boundary:** `ListRow` keeps trailing actions outside its native clickable body and tests keyboard activation plus accessible name/description behavior ([packages/ui/src/primitives/list-row/list-row.tsx](/home/inktomi/inktomi-stack/development/orbweaver/packages/ui/src/primitives/list-row/list-row.tsx:276), [tests/ui/primitives/list-row/list-row.ct.tsx](/home/inktomi/inktomi-stack/development/orbweaver/tests/ui/primitives/list-row/list-row.ct.tsx:18)).

## Declared versus completed

All 13 primitive families have their declared source doors and assigned mirrored behavioral tests. The CT receipt establishes current browser execution for each assigned executable `.ct.tsx`; the two non-browser logic files have focused unit evidence. Source files without an executable test suffix are supporting barrel, variant, handle, or fixture modules and are exercised transitively by their associated CT stories.

## Tests and gates

CT is the relevant behavioral tier for the interactive primitives and passed 177/177. The focused unit run passed 22/22. The `pnpm test` wrapper has a positional-argument scope bug: it ignored the two requested paths and started the whole node suite, so that attempt is explicitly excluded from the lane result. Static checks were not treated as behavioral proof.

## Cross-lane edges

- The completed repository liveness lens reports six UI candidates, two lane-owned. Public-API intent must be reconciled before synthesis treats the handle types as export rot.
- The `pnpm test` positional-path scope escape is a tooling edge; it belongs to the test-script/tooling owners, not this primitive lane.

## Tool receipts

See `commands.md`. Completed AST scan total: 308 typed UI files, 4,614 skipped as out of scope, six candidates. Literal negative cross-check total: 0 because no negative finding was issued. Test totals: CT 177 passed; focused unit 22 passed.

## Lane verdict

The frozen 63-path scope is checksum-stable and has current behavioral proof: 177 passing owned CT tests plus 22 passing focused unit tests. No owned behavioral defect was established. Resolution-based export liveness completed with two owned public-handle candidates; their product/API intent remains unresolved, so this audit makes no dead-export claim.
