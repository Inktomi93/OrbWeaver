## Lane identity

- Lane: `server-entry-compose`
- Semantic scope: server composition seams and their 16 mirrored unit/integration tests.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`
- Working-tree basis: current working-tree bytes; 0 dirty owned paths.
- Assigned files read: 45 / 45 (100%).
- Assigned lines read: 12,998 / 12,998 (100%).
- Assigned bytes read: 755,693 / 755,693 (100%).
- Dirty assigned paths: 0.
- Exclusions: no owned-file exclusions; CT/e2e are outside this lane’s assigned test set.

## Read receipt

`read-receipt.tsv` contains each owned path and reconciles its current line count, byte count, and SHA-256 to `assignment.txt`: 45 files, 12,998 lines, 755,693 bytes.

## Architecture observed

The public compose front door deliberately exports the keystone and test seams from `packages/server/src/entry/compose/index.ts:4-20` (R3: resolved export/call analysis). `buildChatService` assembles the domain context and returns narrower cross-domain operations rather than importing rpg/automation ownership into chat (`packages/server/src/entry/compose/chat.ts:840-1250`, R3). `buildAutomationPlugin` supplies automation and sandbox-plugin write paths through the same injected operation bundle, including per-request principal resolution (`packages/server/src/entry/compose/automation-plugin.ts:92-220`, R3). Plugin canon reads apply the caller’s floor in SQL and strip hidden spans before guest-realm delivery (`packages/server/src/entry/compose/plugin-chat-reads.ts:42-75`, R4/R5).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Chat composition/turn bridge | 4 | 4 | 4 | 3 | 4 | high | `packages/server/src/entry/compose/chat.ts:432-580`; `tests/server/entry/compose/chat.test.ts:1`; `tests/server/entry/compose/chat.int.test.ts:1`; current scoped integration run (R5) |
| Asset, background, and imagery composition | 4 | 4 | 4 | 3 | 4 | high | `packages/server/src/entry/compose/assets-character.ts:89-412`; `packages/server/src/entry/compose/materialize-background.ts:47-82`; corresponding current unit/integration tests (R4–R5) |
| Automation/plugin membrane | 4 | 4 | 4 | 3 | 3 | medium | `packages/server/src/entry/compose/automation-plugin.ts:92-402`; `packages/server/src/entry/compose/automation-watcher.ts:66-132`; `tests/server/entry/compose/plugin-chat-reads.int.test.ts:1`; current scoped integration run (R5) |
| RPG and demo composition | 4 | 4 | 4 | 3 | 4 | high | `packages/server/src/entry/compose/demo-chat-game.ts:90-201`; `tests/server/entry/compose/rpg.int.test.ts:1`; current scoped integration run, 67 tests (R5) |

## Findings

No defect finding is established within this lane’s owned bytes. The resolution-based orphan and test-only lenses each returned no candidates, and the exact owned behavioral suite is currently green. The clean lens outputs are bounded tool results—not promoted absence claims—because no independent negative method was recorded.

## Proven strengths

- The assigned behavioral suites currently pass: 16 files / 172 tests, including 67 serial RPG integration tests and composed-real coverage (`tests/server/entry/compose/rpg.int.test.ts:1-2824`; command receipt; R5).
- Plugin canon projection is covered by a current integration test and places both history floor and hidden-span policy at the SQL/read boundary (`packages/server/src/entry/compose/plugin-chat-reads.ts:42-75`; `tests/server/entry/compose/plugin-chat-reads.int.test.ts:1-79`; R5).
- The materialized external-background path has focused unit failure-path coverage and binds safe fetch, image inspection, and owned storage (`packages/server/src/entry/compose/materialize-background.ts:47-82`; `tests/server/entry/compose/materialize-background.test.ts:1-97`; R4).

## Declared versus completed

`pnpm ast exports` enumerated 71 exports in 27 owned source files; enumeration alone is not reachability evidence. The resolved `orphans` and `testonly` lenses returned zero candidates, retained only as bounded tool output. The observable composition paths listed above are backed by currently passing assigned tests; this does not prove unassigned transport/bootstrap integration.

## Tests and gates

The lane owns 8 unit and 8 integration/integration-serial files (16 total); current execution passed 172 assertions. Assertions cover the bridge, event fan-outs, materialization refusals, hidden/canon floor handling, default seed behavior, and composed RPG flows. The repository membership gates are green. No current CT/e2e/live-runtime receipt exists in this lane, so operability cannot be scored above 4.

## Cross-lane edges

- Bootstrap/transport must reconcile live reachability from the app entry to `createServices`; this lane proves composition and its scoped tests, not runtime startup.
- Domain lanes own the business semantics behind injected services; this lane only verifies their composition bindings.

## Tool receipts

See `commands.md`. Resolution-based structural scans reported 71 exports/27 files, zero orphan candidates, and zero test-only candidates. The only source extensions in scope are `.ts`; no `.tsx` files are excluded. No tool failure or timed-out command occurred.

## Lane verdict

The owned compose seams have positive call/assembly receipts and 172 passing scoped behavioral tests. Native orphan/test-only lenses returned no candidates, but those clean outputs are not treated as proven absence. The strongest proof is current integration coverage for composition-sensitive paths. The largest remaining uncertainty is live startup/transport integration, which belongs to the entry/boot and transport lanes rather than this one.
