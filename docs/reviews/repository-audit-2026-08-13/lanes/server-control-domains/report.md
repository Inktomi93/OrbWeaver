## Lane identity

- Lane: `server-control-domains`
- Semantic scope: server admin, export, notifications, plugin, preset, sessions, settings, and their mirrored tests.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`.
- Working-tree basis: all 269 owned paths are byte-identical to the assigned snapshot; the known dirty worktree paths are outside this lane.
- Assigned files read: 269 / 269 (100%).
- Assigned lines read: 20,398 / 20,398 (100%).
- Assigned bytes read: 1,018,612 / 1,018,612 (100%).
- Dirty assigned paths: 0.
- Exclusions: router registration, entry composition, client affordances, infrastructure runtime, and e2e/CT harnesses belong to other lanes.

## Read receipt

`read-receipt.tsv` has one current SHA-256, line count, and byte count for every owned path: 269 records / 20,398 lines / 1,018,612 bytes. It reconciles exactly with `assignment.txt`.

## Architecture observed

Each domain exposes a front door and composes verb factories over an explicit injected context: admin at `packages/server/src/domain/admin/service.ts:17`, export at `packages/server/src/domain/export/service.ts:12`, notifications at `packages/server/src/domain/notifications/service.ts:19`, plugin at `packages/server/src/domain/plugin/service.ts:20`, preset at `packages/server/src/domain/preset/service.ts:20`, sessions at `packages/server/src/domain/sessions/service.ts:30`, and settings at `packages/server/src/domain/settings/service.ts:22` (R2 from declarations and full reads). This establishes local service assembly, but not a claim that every service is product-reachable.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Admin | 3 | 2 | 4 | 3 | 3 | high | `packages/server/src/domain/admin/service.ts:17`; `tests/server/domain/admin/verbs/create-user.int.test.ts:18`; current integration pass (R5). |
| Export | 3 | 2 | 4 | 2 | 3 | high | `packages/server/src/domain/export/service.ts:12`; `tests/server/domain/export/verbs/export-chat.int.test.ts:113`; current integration pass (R5). |
| Notifications | 3 | 2 | 4 | 3 | 3 | high | `packages/server/src/domain/notifications/service.ts:19`; `tests/server/domain/notifications/verbs/record.int.test.ts:27`; current integration pass (R5). |
| Plugin | 4 | 4 | 4 | 3 | 2 | high | `packages/server/src/domain/plugin/service.ts:20`; `tests/server/domain/plugin/verbs/install.int.test.ts:12`; AST `unwired plugin`; current integration pass (R5). |
| Preset | 3 | 2 | 4 | 3 | 3 | high | `packages/server/src/domain/preset/service.ts:20`; `tests/server/domain/preset/verbs/resolve-effective.int.test.ts:50`; current integration pass (R5). |
| Sessions | 3 | 2 | 4 | 3 | 3 | high | `packages/server/src/domain/sessions/service.ts:30`; `tests/server/domain/sessions/verbs/provision-identity.int.test.ts:53`; current integration pass (R5). |
| Settings | 3 | 2 | 4 | 3 | 3 | high | `packages/server/src/domain/settings/service.ts:22`; `tests/server/domain/settings/verbs/update-user-settings-section.int.test.ts:12`; current integration pass (R5). |

Scores deliberately do not infer transport/client reachability for non-plugin domains; those composition roots are out of scope. No score of 5 is claimed because this lane did not produce current e2e/live-runtime evidence.

## Findings

No behavior defect, declared-not-wired defect, or gate blind spot was proven in the owned files.

## Proven strengths

### `server-control-domains-01` — plugin dormancy is explicit and mechanically observable

- Class: proven-strength
- Confidence: high.
- Evidence rung: R5 (current direct integration execution), with R3 structural evidence for mounted-but-unconsumed procedures.
- Scope denominator: seven mounted `plugin.*` procedures; 369 procedures enumerated by the repository AST lens.
- Receipts: `packages/server/src/domain/plugin/index.ts:6` documents the deliberate build-order dormancy; `packages/server/src/domain/plugin/service.ts:20` assembles the tested service; `pnpm ast unwired plugin` reports the seven mounted procedures at unowned router lines 37-63; literal client scan covers 932 TS/TSX files with zero dot/optional/bracket access matches; scoped Vitest passes plugin activation, persistence, service, substrate, and verb tests.
- Established fact: the service is implemented and server-mounted but has no current client procedure consumer. The source itself labels that state intentional pending the install/list pane.
- User or system impact: plugin runtime behavior is verified behind the server boundary, but no shipped user affordance can invoke it.
- What remains unverified: the ownership and future arrival of the client pane; e2e execution after it exists.
- Suggested next check or fix: when the client wave lands, rerun `pnpm ast unwired plugin` and add an end-to-end install/list flow.

## Declared versus completed

The seven domains have declared front doors and concrete service assembly (R2), and all paired runnable tests passed in a current scoped run, including integration tests (R5). Plugin additionally has an observed mounted router surface (R3) but no client consumption; it is cited as intentional rather than silently unwired. No conclusion is made about external reachability of the other six services.

## Tests and gates

The direct runner passed 99 files / 652 tests with no type errors: 82 integration, 16 unit, one type test. This is current R5 integration evidence, but not CT, e2e, or live-runtime evidence. Current canonical `reports/test-report.json`, `reports/check-structure.json`, and `reports/verify.json` predate the scoped run; their failures were inspected and are not attributed to this lane (details in `commands.md`).

## Cross-lane edges

- Plugin router registration and client consumption are outside lane ownership. The router/client lanes should reconcile the seven `plugin.*` zero-consumer procedures against the explicit citation at `packages/server/src/domain/plugin/index.ts:6`.
- Entry composition determines product reachability for all seven services and remains outside this lane.

## Tool receipts

`pnpm ast` was read and used after the full-read barrier. Resolution-based `orphans` returned no candidates for owned admin/export scopes. `unwired plugin` enumerated 369 procedures and reported seven plugin hits; the negative client conclusion has an independent literal scan covering 932 TS/TSX files and dot/optional/bracket forms. Complete commands, durations, outputs, artifact freshness, and exclusions are in `commands.md`.

## Lane verdict

All 269 owned files were read and hash-reconciled to the snapshot. Every runnable paired test passed in the current 99-file / 652-test scoped run. The local admin/export/notifications/plugin/preset/sessions/settings composition roots are implemented and tested. Plugin is server-mounted but deliberately has no client arrival surface, with both source citation and structural evidence. The largest remaining uncertainty is external entry/client reachability for the six non-plugin domains, which lies outside lane ownership.
