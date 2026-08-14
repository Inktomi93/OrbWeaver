## Lane identity

- Lane: `client-components`
- Semantic scope: 33 client-shared component/helper sources and 19 mirrored tests/fixtures.
- Snapshot commit: formal rolling `assignment.txt`, `41e18afe74afa570b67a3e670a1a38863c486a00`.
- Working-tree basis: all 52 assigned paths are clean and their current line counts, byte counts, and SHA-256 values exactly match the formal assignment.
- Assigned files read: 52 / 52 (100%).
- Assigned lines read: 7,997 / 7,997 (100%).
- Assigned bytes read: 412,699 / 412,699 (100%).
- Dirty assigned paths: 0.
- Exclusions: feature consumers and their tests are cross-lane evidence only, not read as an assigned corpus.

## Read receipt

`read-receipt.tsv` covers all 52 formal-assignment paths with matching line counts, byte counts, and SHA-256 values.

## Architecture observed

The client front door explicitly re-exports the shared composites from `packages/client/src/components/index.ts:4` through `packages/client/src/components/index.ts:74`, while `@orb/ui` imports stay at primitive level (for example `packages/client/src/components/confirm-dialog.tsx:10` and `packages/client/src/components/character-picker.tsx:17`). This matches the client-shared, domain-aware tier described by UI law rather than leaking domain composites into `@orb/ui`.

Resolved-reference evidence reaches live feature consumers: `BackgroundSourceField` is mounted by character and chat surfaces (`packages/client/src/features/character/components/character-appearance-tab.tsx:175`, `packages/client/src/features/chat/components/room-overrides-tab.tsx:74`); `CharacterPicker` has five feature consumers (`packages/client/src/features/chat/components/add-member-popover.tsx:42`, `packages/client/src/features/refinery/components/teaching-state.tsx:100`); `EntryListEditor` reaches preset and RPG editors (`packages/client/src/features/preset/components/user-macros-tab.tsx:49`, `packages/client/src/features/rpg/components/rpg-game-macros.tsx:86`); and `RelationManagerSection` reaches its character surface (`packages/client/src/features/character/components/character-relations-tab.tsx:51`). All are R3, not end-to-end proof.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - |
| Directly CT-covered shared controls (11 CT files, 117 declarations) | 4 | 3 | 5 | 3 | 4 | high | `tests/client/components/confirm-dialog.ct.tsx:10`; `tests/client/components/tracker-blocks/tracker-blocks.ct.tsx:1`; current scoped CT result in `commands.md` |
| Face-strip fold engine | 4 | 3 | 5 | 3 | 4 | high | `packages/client/src/components/face-strip-fold.ts:1`; `tests/client/components/face-strip-fold.test.ts:14`; current unit result in `commands.md` |
| Directly untested shared composites: background picker, character picker, entry editor, user-macro editor | 3 | 3 | 0 | 3 | 2 | medium | `packages/client/src/components/background-source-field.tsx:59`; `packages/client/src/components/character-picker.tsx:67`; `packages/client/src/components/entry-list-editor.tsx:57`; `packages/client/src/components/user-macro-editor-dialog.tsx:99` |

## Findings

### CC-01 — Four live shared composites have no direct owned behavioral proof

- Severity: P2
- Class: declared-not-tested
- Confidence: high
- Evidence rung: R3
- Scope denominator: 33 owned source files and 19 owned test/fixture files; this is strictly an owned-corpus conclusion, not a claim that cross-lane feature tests do not cover the composites.
- Receipts: `packages/client/src/components/background-source-field.tsx:59`, `packages/client/src/components/character-picker.tsx:67`, `packages/client/src/components/entry-list-editor.tsx:57`, `packages/client/src/components/user-macro-editor-dialog.tsx:99`; resolved live calls noted under Architecture observed; the owned tests' literal cross-check recorded in `commands.md`.
- Established fact: These components implement mutation/focus/editor behavior and are reachable through live feature JSX, but none has an owned `*.ct.tsx` or unit test that imports and drives it. The 120-pass scoped CT establishes surrounding assigned tests, not these four behaviors.
- User or system impact: background materialization's discrete Apply boundary, character selection/exclusion/focus, list-editor destructive confirmation, and macro-editor field mutation can regress without this lane's browser suite detecting it.
- What remains unverified: Feature-level CT may provide indirect coverage in sibling lanes; it was intentionally not claimed without reading those lanes' tests.
- Suggested next check or fix: Add focused CTs at these mirrors, beginning with `BackgroundSourceField`'s external-URL draft/apply and read-only branches, `CharacterPicker`'s exclusion/selection/focus paths, and one full edit/remove flow for each editor.

## Proven strengths

- The scoped current Playwright CT run passed all 120 tests with zero retries/flakes (R5); it exercises meaningful dialog, strip, header, regex, toggle, tag-picker, and tracker behavior, not existence-only mounts. `tests/client/components/confirm-dialog.ct.tsx:10`; `tests/client/components/tracker-blocks/tracker-blocks.ct.tsx:1`; `commands.md`.
- Fold behavior has both deterministic unit assertions for exact geometry arms and browser coverage for the rendered strip (R5). `packages/client/src/components/face-strip-fold.ts:1`; `tests/client/components/face-strip-fold.test.ts:14`; `tests/client/components/face-strip.ct.tsx:22`.

## Declared versus completed

The shared front door is declared and consumed (R3) for the inspected cross-feature composites; `pnpm ast orphans packages/client/src/components` reported no unresolved export candidates. Directly CT-covered components reached R5 on the current scoped run. The four composites in CC-01 are implemented and live-wired (R3), but direct behavioral proof in the owned test corpus stops before R4.

## Tests and gates

The owned corpus contains 11 CT files, seven CT fixture modules, and one unit file: 117 top-level CT declarations plus seven unit tests. The scoped Playwright result is current and its canonical JSON reports were read immediately. The unit runner passed its seven fold cases. No current integration/e2e proof was in this lane's assignment. `pnpm ast orphans` and `pnpm ast cycles client` were clean, but neither was used as a behavioral completion claim and no positive-control finding is drawn from those clean structural lenses.

## Cross-lane edges

- Feature lanes own the consumers and any indirect coverage for CC-01; they should reconcile the requested user flows before treating the direct-test gap as fully unproved.
- The formal assignment and receipt are exact at `41e18afe74afa570b67a3e670a1a38863c486a00`; synthesis can use either for this lane's file/count/hash denominator.

## Tool receipts

See `commands.md` for exact native-AST, literal cross-check, CT, unit, tool-guard, and canonical-report receipts. No source-level negative is generalized beyond the owned test corpus.

## Lane verdict

All 52 assigned files were read and reconciled to current hashes. The shared-components tier is real code, explicitly exported, and has live feature consumers; the assigned CT corpus is currently green (120/120), with zero CT flakes. The fold engine has layered unit and browser proof. Four mutation-bearing, live shared composites lack direct behavioral proof in this lane, so they remain R3 despite the green neighboring CT corpus. No product runtime defect was established.
