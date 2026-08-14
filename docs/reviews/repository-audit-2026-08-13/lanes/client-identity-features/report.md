# Client identity features audit

## Lane identity

- Lane: `client-identity-features`
- Semantic scope: client character, credentials, persona, and user-admin feature surfaces plus their mirrored tests/support.
- Snapshot commit: `c93253a3f907fb7fd93d411c511a98ed378505db`
- Working-tree basis: current working-tree bytes; all 181 assigned paths matched the assignment SHA-256 at the initial reconciliation.
- Assigned files read: 181 / 181 (100%).
- Assigned lines read: 20,745 / 20,745 (100%).
- Assigned bytes read: 1,026,417 / 1,026,417 (100%).
- Dirty assigned paths: 0 at initial reconciliation; final reconciliation recorded below.
- Exclusions: no assigned source/test path excluded. Unowned composition and route files were read only as cross-lane wiring receipts.

## Read receipt

`read-receipt.tsv` covers all 181 `OWNED` paths from `assignment.txt`, with the assignment's verified line, byte, and SHA-256 values. It totals 20,745 lines and 1,026,417 bytes.

## Architecture observed

The character feature offers its section factory through `makeCharactersSection`; `packages/client/src/main.tsx:243` composes it into the section registry, and the factory wraps its list pane in `CharacterLibraryAnchor` at `packages/client/src/features/character/lib/characters-section.tsx:42` (R3; `pnpm ast refs makeCharactersSection` and `CharacterLibraryAnchor`).

Credentials exposes its settings pane at `packages/client/src/features/credentials/lib/connections-pane.tsx:10`; the pane renders `ConnectionsSettingsSurface` at `:62`, and `packages/client/src/main.tsx:354` registers it (R3; `pnpm ast refs connectionsPane` and `ConnectionsSettingsSurface`).

Persona is reachable as both a chrome widget and a settings-sheet presentation: `packages/client/src/features/persona/lib/persona-chrome.tsx:21` renders `PersonaPanelSurface`, while `packages/client/src/features/persona/surfaces/persona-settings-surface.tsx:65` renders its sheet lens (R3; `pnpm ast refs PersonaPanelSurface`). The forced first-run dialog is mounted at `packages/client/src/routes/app-root.tsx:85` (R3; `pnpm ast refs FirstRunPersonaDialog`).

User admin is a viewer-gated settings contribution: `packages/client/src/features/user-admin/lib/admin-pane.tsx:20` declares `when: (viewer) => viewer.isAdmin`, and `packages/client/src/main.tsx:356` registers it (R3; `pnpm ast refs adminPane`). Its create-user hook is instantiated by `packages/client/src/features/user-admin/components/admin-create-user-dialog.tsx:47` (R3; `pnpm ast refs useCreateUser`).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Character feature (54 source, 15 test/support files) | 3 | 4 | 5 | 3 | 3 | high | `packages/client/src/features/character/lib/characters-section.tsx:31`; `packages/client/src/main.tsx:243`; five current unit suites, 38 assertions; current assigned CT scope included in 243/243 pass |
| Credentials feature (18 source, 7 test/support files) | 3 | 4 | 5 | 3 | 3 | high | `packages/client/src/features/credentials/lib/connections-pane.tsx:10`; `packages/client/src/features/credentials/lib/connections-pane.tsx:62`; `packages/client/src/main.tsx:354`; two current unit suites, 54 assertions; current assigned CT scope included in 243/243 pass |
| Persona feature (18 source, 6 test/support files) | 3 | 4 | 5 | 3 | 3 | high | `packages/client/src/features/persona/lib/persona-chrome.tsx:21`; `packages/client/src/routes/app-root.tsx:85`; one current unit suite, 9 assertions; current assigned CT scope included in 243/243 pass |
| User-admin feature (49 source, 14 test/support files) | 3 | 4 | 5 | 3 | 3 | high | `packages/client/src/features/user-admin/lib/admin-pane.tsx:20`; `packages/client/src/main.tsx:356`; current assigned CT scope included in 243/243 pass |

Scores are scoped to the listed lane files. Operability remains below live/e2e because the current browser proof is component-test based rather than a deployed server/browser journey.

## Findings

No product or instrument defect was established from the assigned source and current behavioral receipts. The earlier CT invocation limitation was resolved by the coordinator's exact 29-file sanctioned run: 243/243 passed with zero failures, flakes, or skips.

## Proven strengths

- `characterUpdateDiff` builds a normalized baseline and emits only changed keys at `packages/client/src/features/character/lib/character-card-form-model.ts:123`; its no-op, changed-key, explicit-null-clear, and untouched-field behavior is asserted at `tests/client/features/character/lib/character-card-form-model.test.ts:126`, `:132`, `:140`, and `:148` (R4; current unit run).
- The credentials routing model writes explicit `null` clears rather than merge no-ops at `packages/client/src/features/credentials/lib/connections-model.ts:244`; its clear/provider-switch and contract round-trip behavior is asserted at `tests/client/features/credentials/lib/connections-model.test.ts:72`, `:108`, `:116`, `:135`, and `:175` (R4; current unit run).
- The persona mapper preserves loose provenance metadata and withholds the wire-rejected assistant/depth-zero prefill at `packages/client/src/features/persona/lib/persona-editor-model.ts:61` and `:109`; those behaviors are asserted at `tests/client/features/persona/lib/persona-editor-model.test.ts:70` and `:101` (R4; current unit run).

## Declared versus completed

| Declared surface | Strongest evidence | Status |
| - | - | - |
| Character section and library anchor | R5 | Registered in the client composition root; current unit and assigned CT proof. |
| Credentials settings pane | R5 | Registered in the client composition root; current unit and assigned CT proof. |
| Persona chrome/settings/first-run dialog | R5 | Both presentation paths and app-root mount have structural reachability; current unit/assigned CT plus cross-lane route CT proof. |
| User-admin settings pane and create-user mutation | R5 | Registry/UI-hook call paths plus current assigned CT proof. |

## Tests and gates

The unit command completed 8/8 files and 101/101 assertions: character 38, credentials 54, persona 9 (R4). The tests make real behavior assertions, including partial-patch preservation and explicit-null routing clears; they are not existence-only checks. The assigned executable inventory is 8 unit files, 29 CT files, and 0 integration/contract/type/e2e files; five additional `_ct-stories.tsx` support modules bring the CT/support total to 34. The current exact CT command passed 243/243 (R5). Static/lint success was neither run nor treated as behavioral evidence.

The first-run persona dialog has CT coverage outside this lane at `tests/client/routes/app-root.ct.tsx:196`, `:206`, `:208`, and `:223`; `pnpm ast refs FirstRunPersonaDialog --in tests/client` returned no symbol references because that test exercises route render state rather than importing the component. Literal search was the appropriate independent method for that cross-lane exact test-id claim.

## Cross-lane edges

- The app-root route owns the first-run persona dialog CT evidence at `tests/client/routes/app-root.ct.tsx:196`; the route/integration lane should retain it as the behavioral owner. This lane established only the dialog’s R3 mount at `packages/client/src/routes/app-root.tsx:85`.
- The main composition root owns registrations at `packages/client/src/main.tsx:243`, `:354`, and `:356`. The client-shell/composition lane should reconcile registry completeness; this lane only traced its feature doors to those registrations.

## Tool receipts

`pnpm ast exports` reported character 130/53, credentials 70/17, persona 36/17, and user-admin 98/48 (exports/files). Resolution-aware `refs` receipts establish the named paths above. The 63 `.ts` + 118 `.tsx` assigned-file denominator is recorded in `commands.md`; `pnpm ast` does not expose an AST scanned-file denominator. Broad `orphans` was attempted per feature but produced no final output before terminal supervision killed it, so no clean/absence claim is made. The literal cross-check for the first-run dialog is recorded in `commands.md`.

## Lane verdict

All 181 assigned paths were read and hash-reconciled. Character, credentials, persona, and user-admin surfaces have R3 composition receipts, current R4 unit proof (101 assertions), and current R5 browser-component proof across all 29 assigned CT files (243/243). No product or instrument defect was established. Live server/e2e deployment remains outside this lane.
