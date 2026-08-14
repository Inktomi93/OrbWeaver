## Lane identity

- Lane: client-preset-refinery
- Semantic scope: client preset editor/library and refinery session UI, hooks/models, and 46 mirrored test/support files.
- Snapshot commit: c93253a3f907fb7fd93d411c511a98ed378505db; current HEAD: 632d42f989448451e7cbcc789a985ee0a862208.
- Working-tree basis: current owned bytes, reconciled to assignment at 2026-08-13T23:50:55-06:00.
- Assigned files read: 138 / 138 (100%).
- Assigned lines read: 22,448 / 22,448 (100%).
- Assigned bytes read: 1,207,813 / 1,207,813 (100%).
- Dirty assigned paths: 0.
- Exclusions: no binaries; five stories and one fixture are test inputs, not runners; e2e/live is outside lane scope.

## Read receipt

read-receipt.tsv covers all 138 assignment paths with frozen SHA-256, lines, and bytes.
Final reconciliation found no owned-byte drift.

## Architecture observed

Preset selection mounts the editor through packages/client/src/features/preset/components/preset-content.tsx:19 (R3).
The editor owns focus, scrolling, loading, and error boundaries at packages/client/src/features/preset/surfaces/preset-editor-surface.tsx:99 and packages/client/src/features/preset/surfaces/preset-editor-surface.tsx:104 (R3).

Refinery is a live rail section: packages/client/src/features/refinery/lib/refinery-section.tsx:83 mounts RefineryContentSurface (R3).
The content surface switches between start and session panes at packages/client/src/features/refinery/surfaces/refinery-content-surface.tsx:66.
Its selected-session path composes reads/writes at packages/client/src/features/refinery/surfaces/refinery-content-surface.tsx:100, state selection at packages/client/src/features/refinery/surfaces/refinery-content-surface.tsx:131, controls at packages/client/src/features/refinery/surfaces/refinery-content-surface.tsx:219, and terminal transforms at packages/client/src/features/refinery/surfaces/refinery-content-surface.tsx:358 (R3).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Preset editor/library (63 source files; 15 CT + 12 unit/integration files) | 4 | 4 | 4 | 4 | 3 | high | preset-content.tsx:19; preset-editor-surface.tsx:99; current R5 test receipts. |
| Refinery data tier/list (29 source files; 8 CT, 1 unit) | 3 | 4 | 4 | 4 | 3 | high | refinery-section.tsx:83; refinery-list-surface.ct.tsx:54; current R5 CT. |
| Refinery content workflow (one surface; zero direct surface CT) | 3 | 4 | 2 | 4 | 3 | high | refinery-content-surface.tsx:100; bounded test negative below. |

## Findings

### client-preset-refinery-01 — Refinery’s main content workflow has no direct behavioral proof

- Severity: P2
- Class: test-quality
- Confidence: high
- Evidence rung: R3 for live composition; R0 for direct behavioral proof.
- Scope denominator: 2 assigned refinery source surfaces, one direct surface CT (the list); all assigned refinery tests are 11 files: 2 TS plus 9 TSX.
- Receipts: packages/client/src/features/refinery/lib/refinery-section.tsx:83; packages/client/src/features/refinery/surfaces/refinery-content-surface.tsx:100; packages/client/src/features/refinery/surfaces/refinery-content-surface.tsx:131; packages/client/src/features/refinery/surfaces/refinery-content-surface.tsx:219; packages/client/src/features/refinery/surfaces/refinery-content-surface.tsx:358; tests/client/features/refinery/surfaces/refinery-list-surface.ct.tsx:54; commands.md structural and literal receipts.
- Established fact: The live section mounts RefineryContentSurface. Its session path joins three reads, five write paths, run/view-back/armed-rewrite selection, decision-sheet state, and terminal controls. Ast-grep scanned all assigned refinery test TS (2) and TSX (9) files with zero code references; rg finds only an explanatory comment at tests/client/features/refinery/_ct-stories.tsx:254. Component CTs do not mount this composition.
- Impact: Cross-control state regressions can pass component and hook CTs while breaking the primary workflow.
- Unverified: Mounted session lifecycle and terminal actions through the live content surface.
- Suggested next check: add one routed RefineryContentSurface CT covering loading, view-back, rewrite decision plus apply, and terminal result.

### client-preset-refinery-02 — Refinery CT story documentation says the now-live R3 surface does not exist

- Severity: P3
- Class: architecture-drift
- Confidence: high
- Evidence rung: R3.
- Scope denominator: one assigned R3 story module and one assigned live section definition.
- Receipts: tests/client/features/refinery/_ct-stories.tsx:3; packages/client/src/features/refinery/lib/refinery-section.tsx:83; packages/client/src/features/refinery/surfaces/refinery-content-surface.tsx:60.
- Established fact: The story header calls R3 design-gated with no production surface, while refinerySection mounts it in the live content slot.
- Impact: The stale rationale makes the hook probe look like an unavoidable surrogate rather than incomplete coverage.
- Unverified: Commit-history cause is outside lane scope.
- Suggested next check: correct the header when adding the missing surface CT.

## Proven strengths

- Proven strength (R5; high confidence): the assigned behavioral suite passed 13/13 files and 89/89 assertions; assigned CT passed 23/23 files and 198/198 tests with no failures, flakes, or skips.
- Proven strength (R5; high confidence): the refinery roster CT proves server-provided identity is visible and searchable past a character page and asserts no `character.list` query: `tests/client/features/refinery/surfaces/refinery-list-surface.ct.tsx:54` and `tests/client/features/refinery/surfaces/refinery-list-surface.ct.tsx:67`.

## Declared versus completed

| Surface | Strongest evidence | Status |
| - | - | - |
| PresetEditorSurface | R5 | Live composition plus direct assigned surface CT. |
| RefineryListSurface | R5 | Live section composition plus direct roster CT. |
| RefineryContentSurface | R3 | Live composition; no direct behavior test. |
| useDeleteRefinerySession | R4 test-only | Deliberately future-marked at use-refinery-mutations.ts:130; CT probe is current consumer. |
| useDeleteRefinerySchema | R2 | Deliberately future-marked at use-refinery-schemas.ts:54; no current consumer. |

Resolved orphan analysis found no unexempted preset export. The global ratchet confirmed zero unexempted or stale public markers.
The test-only candidates are not defects: two preset helpers are unit-tested and session delete is explicitly CT-driven until its affordance exists.

## Tests and gates

Inventory: 8 unit files / 66 tests, 5 integration files / 23 tests, 23 CT files / 198 tests, 5 stories, and one fixture.
There are no assigned contract, e2e, live, or type-test files.
Both behavioral runners and test-membership, runner-membership, and orphan-ratchet gates passed.
That proves modeled and component behavior but not the unmounted refinery-content composition.

## Cross-lane edges

- Refinery consumes server procedures through tRPC; contract/server correctness and live availability belong to server/contract lanes.
- The green CT build emitted esbuild es2025 warnings; this is a configuration edge outside lane ownership, not a test failure.

## Tool receipts

Resolved repository AST used orphans, testonly, exports, and refs. Direct ast-grep was only the fallback for the test-absence claim: TS denominator 2, TSX 9, zero code matches, confirmed by literal search. No owned file was excluded and no official runner failed. Commands.md has complete command details.

## Lane verdict

Preset editor/library and refinery roster/data paths have current R5 behavioral receipts.
The refinery section and content surface are live, not scaffolds.
The content workflow lacks a direct test, the largest remaining proof gap.
One CT-story header is stale and calls that live R3 surface non-production.
Owned bytes matched the assignment through final reconciliation.
