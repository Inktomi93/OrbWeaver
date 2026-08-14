# Client-state lane report

## Lane identity

- Lane: client-state
- Semantic scope: the 59 assigned client state sources (store/factory, registry/context, stream, selection,
  persistence, and front-door exports) and their 50 assigned tests.
- Snapshot commit: 41e18afe74afa570b67a3e670a1a38863c486a00.
- Working-tree basis: final current bytes in read-receipt.tsv. Four OWNED rows advanced after the initial
  reconciliation (listed below); all four current versions were re-read.
- Assigned files read: 109/109 OWNED; 8,690/8,690 lines; 464,656/464,656 bytes.
- Dirty assigned paths: 0 (exact staged-path git-status check).
- Tests examined: 20 unit files, 1 type-test file, 28 CT files; no integration/e2e files assigned.
- Exclusions: no source/config/test outside the assignment was audited as this lane's implementation. The
  autosave edge below was inspected only because the orchestrator explicitly required reconciliation with
  the client-forms P2.

## Read receipt

read-receipt.tsv covers 100% of assignment.txt: all 109 OWNED and 9 SHARED rows, with final current
line, byte, and SHA-256 values. Four OWNED paths changed relative to the staged snapshot:
packages/client/src/state/character-library-store.ts, packages/client/src/state/index.ts,
tests/client/state/_ct-stories.tsx, and tests/client/state/character-library-store.ct.tsx. Their current
versions were re-read; exact git status for every OWNED path was clean.

## Architecture observed

@orb/client/state is the state front door: it says server state belongs to TanStack Query and exports the
three client-store doors—gated transient stores, entity-draft stores, and persisted singleton stores
(packages/client/src/state/index.ts:1-5; R3 export boundary). createGatedStore supplies the common
Zustand/devtools/selector wiring and requires an action label through its setter type
(packages/client/src/state/create-gated-store.ts:21-59; R4 with
tests/client/state/create-gated-store.test.ts:18-65).

The persisted factory rejects duplicate names and routes every rehydrate through the total migration
function, preventing a same-version stale blob from reaching a store (packages/client/src/state/create-persisted-store.ts:35-70;
R4 with tests/client/state/create-persisted-store.test.ts:91-174). Entity drafts are explicitly cache,
not canon: the read path drops invalid, schema-stale, or server-baseline-mismatched envelopes
(packages/client/src/state/create-entity-draft-store.ts:125-160; R4 with
tests/client/state/create-entity-draft-store.test.ts:102-136).

The state package itself had no alias-resolved client cycle and no state-directory orphan reported by the
completed AST lenses, but neither lens had a recorded positive control. These are observations, not clean
findings (commands.md).

## Subsystem scorecards

| Subsystem (denominator) | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | - | - |
| Store factories and persistence (3 factory sources; 3 direct unit/type tests) | 4 | 4 | 4 | 3 | 3 | high | create-gated-store.ts:21-59, create-persisted-store.ts:35-70, create-entity-draft-store.ts:98-180; 125-test scoped unit pass |
| Stream and transient state (56 remaining state sources; 17 direct unit tests, 28 CT files) | 4 | 3 | 5 | 3 | 3 | high | `packages/client/src/state/index.ts:1-85`; stream terminal/race assertions `tests/client/state/chat-stream.test.ts:35-120`; current CT 73/73 |
| Registries/context/provider surfaces (assigned registry/context/provider sources and CT files) | 4 | 3 | 5 | 3 | 3 | high | exported provider/context surfaces in `packages/client/src/state/index.ts:83-85`; current CT 73/73 |

## Findings

No client-state-owned behavior defect reached the reporting threshold in the fully read assigned sources
and tests. The concrete autosave defect/proof edge is reported under **Cross-lane edges**, rather than
misattributed to this lane.

## Proven strengths

- **Persisted-state rehydrate hardening (R4):** the always-run merge invokes the total migration path
  (packages/client/src/state/create-persisted-store.ts:56-64); the scoped unit test reproduces both a
  poisoned same-version blob and a valid same-version blob
  (tests/client/state/create-persisted-store.test.ts:147-173).
- **Draft freshness gate (R4):** schema, validator, and baseline mismatch discard a draft instead of
  returning it (packages/client/src/state/create-entity-draft-store.ts:146-159); regression assertions
  cover mismatch, invalid shape, and stale schema
  (tests/client/state/create-entity-draft-store.test.ts:102-136).
- **Stream terminal isolation (R4):** the unit suite asserts a post-terminal delta cannot resurrect a
  slot and that another chat is unaffected (tests/client/state/chat-stream.test.ts:80-103).
- **State browser behavior (R5):** the exact assigned 28-file CT scope currently passes 73/73 with zero failures, flakes, or skips.

## Declared versus completed

| Declared surface | Strongest evidence | Status |
| - | - | - |
| Gated/persisted/entity-draft factory APIs | R4 | Exported from the state front door and exercised by meaningful state-unit assertions. |
| State stream transitions | R4 | Unit assertions exercise accumulation, terminal replacement, re-open, late delta, and chat isolation. |
| State CT coverage | R5 | All 28 assigned CT files currently pass 73/73. |
| Cycle/orphan absence | R0 clean claim | AST completed with no results, but no positive control was recorded, so this does not establish a clean finding. |

## Tests and gates

The exact scoped node command passed 20 files / 125 tests on the final current tree (11.91 s). It includes stateful failure-path checks:
duplicate storage names, corrupted persisted shapes, stale draft envelopes, and terminal stream races
(tests/client/state/create-persisted-store.test.ts:75-88, tests/client/state/create-entity-draft-store.test.ts:67-136,
tests/client/state/chat-stream.test.ts:80-103; R4).

The one assigned type test provides compile-time coverage for labeled gated writes. The coordinator's exact
`pnpm test:ct tests/client/state` rerun passed all 73 tests across the 28 assigned CT files with zero failures,
flakes, or skips (R5). See `commands.md` for the superseded missing-terminal attempt and current receipt.

## Cross-lane edges

### Client-forms P2 reconciliation — autosave may silently succeed without a persistence function

The current generic boundary can omit **both** save seams: factory configuration makes save optional
(packages/client/src/forms/create-autosave-entity-form.tsx:78-100), the boundary resolves only
callTimeSave ?? config.save (packages/client/src/forms/create-autosave-entity-form.tsx:380-401), and
submission awaits the optional call before recording saved and clearing a draft
(packages/client/src/forms/create-autosave-entity-form.tsx:182-194). Thus a boundary mounted with neither seam performs no I/O but
marks the values saved (R2 within the inspected cross-lane boundary; P2 behavior-defect, confidence
medium).

There is a concrete public wrapper that permits that construction: GroupConfigFormProps.save is optional,
its factory has no config.save, and it conditionally omits the call-time prop
(packages/client/src/features/chat/components/group-config-form.tsx:55-87). This establishes that a
**current boundary API can omit both seams**, not merely a hypothetical type construction.

The literal cross-check denominator was the two direct GroupConfigForm source mounts. Both currently
supply a save function: committed chat (packages/client/src/features/chat/components/group-config-form.tsx:188-200) and draft chat
(packages/client/src/features/chat/components/draft-context-tabs.tsx:49-60). Additional concrete
reconciliation likewise verified the preset mount passes autosave.save
(packages/client/src/features/preset/surfaces/preset-editor-surface.tsx:209-227) and the RPG host form
passes save (packages/client/src/features/rpg/components/rpg-host-scalars.tsx:82-99). The completed
AST caller lens found 26 factory callers, but not every caller was expanded as part of this cross-lane
exception; no claim is made that no current production caller omits both seams.

Hand-off: client-forms should decide whether the factory must make one seam required (or explicitly render
read-only and refuse submission when neither exists), then add a regression test for the no-seam boundary.

## Tool receipts

Completed AST scans: cycles client and orphans packages/client/src/state (the latter about 27 s).
Completed semantic autosave scans: ident autosave, callers createAutosaveEntityForm (26 callers), and
refs createAutosaveEntityForm (54 references / 28 files). The GroupConfig AST reference repeat did not
reach a terminal result in the transport. The only literal search was the documented direct-JSX
cross-check for the autosave reconciliation, not an absence conclusion. Full commands, outcomes, and the
coordinator's current 73/73 CT receipt are in `commands.md`.

## Lane verdict

All 109 assigned client-state files and paired tests were read and hash-reconciled to the staged snapshot.
The scoped state unit suite passed 125 assertions across 20 files; persistence, draft freshness, and stream
terminal behavior have R4 proof. Four assigned paths advanced from the staged snapshot and were re-read;
all 28 state CT files currently pass 73/73 at R5. No client-state-owned defect is established. The important remaining
cross-lane risk is that the current autosave boundary API can receive neither save seam and then report
success without persisting; the verified GroupConfig mounts currently avoid it, while the full 26-caller
population was not exhaustively expanded under the cross-lane exception.
