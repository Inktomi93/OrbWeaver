# 1041 shard s1-sec-runtime-boundary-1: membrane dump guard and firehose health

All three rows moved to native successors and were deleted in one commit. Each successor was proven against planted violations before its gate was deleted. This is the redo of a refuted attempt: the guard-after-dump ordering claim now has a working successor at both doors.

## plugin-dump-guard: done

Successor:

- HARD ESLint rule `orb/plugin-dump-guard` (`eslint.config.js`: `PLUGIN_DUMP_HELPER`, `PLUGIN_DUMP_GUARD_EXIT`, `PLUGIN_DUMP_SELECTORS`, the restriction plugin entry, and the `hardConfig` block for `packages/server/src/infra/plugin-host/membrane.ts`). It runs in `eslint-hard.config.js` with `--no-inline-config`, so an inline disable cannot silence it, matching the gate's `hard` authority. In the membrane it refuses:
  - a `dump` member, a `dump` property key, or any `'dump'` string or template literal outside `Program > FunctionDeclaration[id.name='tryDumpGuestValue']`;
  - inside that helper, any of those spellings in a body statement that is not preceded by `if (!handleSafeToDump(...))` whose consequent block directly returns or throws (guard after dump, ignored result, inverted guard, nested-only exit, a dump inside the guard statement), and any of them in a parameter default or destructure, which runs before the body;
  - an import of a binding named `handleSafeToDump`.
- Behavioural test `tests/server/infra/plugin-host/membrane.int.test.ts` over the real composition root (`createServerHarness` with the real broker `spawn`), through `plugin.runSnippet` and the async host door `chat.listMessages`. The guest gives its root argument a `toJSON` sentinel. `ctx.dump` serializes through the guest's `JSON.stringify`, which calls `toJSON` first, so any materialization is observable. A 1000-deep argument (past `PLUGIN_DUMP_DEPTH_GUARD`) must log `refused:Error` and `materialized:false`. An ordinary argument must log `listed:true` and `materialized:true`, the positive control for the sentinel. It runs in per-push Node CI.
- Lint cases in `tests/tooling/verify/ops/security-native-boundaries.test.ts`: every gate row, the delivery suites' computed spellings, and the real membrane source (clean, with the direct bypass, and with the guard moved after the dump).

Why the previous successor failed: its 12,000-deep argument does not overflow an unguarded `ctx.dump` (the verifier's guard-neutralised mutant logged `materialized`), so the test could only show that the guard ran, never that it ran first. The sentinel replaces depth as the observable.

Red first and plants (this run, box load average 16-58 on 24 cores):

- Red first at the lint door. With the prior attempt's `eslint.config.js` swapped in, `pnpm test:scoped tests/tooling/verify/ops/security-native-boundaries.test.ts -t dump` exited 1: the verifier's guard-after-dump shape gave `expected [] to have a length of 1 but got +0`, and so did the live membrane with the guard moved after the dump. With this shard's config the same tests pass.
- Red first at the behavioural door. Each mutant was planted in `packages/server/src/infra/plugin-host/membrane.ts` and `pnpm test:scoped tests/server/infra/plugin-host/membrane.int.test.ts` was run. All exits below are assertion failures, none a timeout:

| Mutant (row) | Int test | Int test failure | Hard lint |
| - | - | - | - |
| `order`, the verifier's exact shape (mustFlag[1]) | exit 1 | `expected [ '[info] refused:Error', '[info] materialized:true' ] to deeply equal [ '[info] refused:Error', '[info] materialized:false' ]` | exit 1, `358:17` ordering message |
| `order` plus `// eslint-disable-next-line orb/plugin-dump-guard -- attempted hard bypass` | not run (same code path) | | exit 1, `359:17` |
| `direct` at the async door (mustFlag[0]) | exit 1 | `[ '[info] accepted', '[info] materialized:true' ]` | exit 1, `1757:50` outside-helper message |
| `ignored` (mustFlag[2]) | exit 1 | `accepted`, `materialized:true` | exit 1, `359:29` |
| `other-handle` (mustFlag[3]) | exit 1 | `accepted`, `materialized:true` | exit 0 (not expressible) |
| `nested-exit` (mustFlag[4]) | exit 1 | `accepted`, `materialized:true` | exit 1, `363:29` |
| `guard-true`, the guard skips its walk (mustFlag[5] as effect) | exit 1 | `accepted`, `materialized:true` | not applicable (no syntax change in the helper) |
| `inverted` (mustFlag[6]) | exit 1 | ordinary call: `[ '[info] refused:Error', '[info] materialized:false' ] to deeply equal [ '[info] listed:true', '[info] materialized:true' ]` | exit 1, `361:29` |
| `default-param`, a dump in a parameter default | not run | | exit 1, `357:89` |

- The hard lint command is `pnpm exec eslint --config eslint-hard.config.js --no-config-lookup --no-inline-config packages/server/src/infra/plugin-host/membrane.ts`. On the restored file it exited 0.
- The int test passed on the restored source before and after the mutants (5.3 s at load average 40). The membrane is byte-identical to its saved copy.
- The old int test (12,000-deep, no sentinel) under the `order` mutant timed out at 8.6 s: no verdict, which matches the verifier's finding that it could not catch ordering.

Parity: 8 mustFlag / 3 mustPass ported, 0 mustFlag lost. mustPass[3] is inverted (stricter).

| Row | Lint (`orb/plugin-dump-guard`, hard) | Int test mutant |
| - | - | - |
| mustFlag[0] founding bypass | flagged (`attachAsync` case; live `bypass` plant) | `direct` |
| mustFlag[1] guard after dump | flagged (verifier's exact shape; live `late` plant) | `order` |
| mustFlag[2] guard result ignored | flagged | `ignored` |
| mustFlag[3] different handle | not expressible (argument comparison) | `other-handle` |
| mustFlag[4] nested conditional exit | flagged | `nested-exit` |
| mustFlag[5] imported same-named guard | flagged (import ban) | `guard-true` (a guard without the walk) |
| mustFlag[6] inverted guard | flagged | `inverted` |
| mustFlag[7] guarded dump in another helper | flagged (`otherHelper`) | not reachable (one helper) |
| mustPass[0] live shape | clean | clean run passes |
| mustPass[1] nested diagnostics | clean | n/a |
| mustPass[2] `realm.ts` dump | rule not configured for `realm.ts` | n/a |
| mustPass[3] other-package `dump` in the membrane | FLAGGED: the untyped rule judges every `dump` spelling in the membrane | n/a |

Lost or narrowed claims:

- Same handle. The lint does not compare the guard's handle with the dump's. Only the int test proves it (`other-handle`), at the async host door.
- Guard identity. The lint refuses an import of the name. A local redefinition of `handleSafeToDump` that skips the walk is caught only by the int test's effect (`guard-true`).
- `dump` identity is spelling, not the QuickJS type. mustPass[3] is inverted: a non-QuickJS `dump` member in the membrane now needs a rename. None exists today.
- A computed key whose `'dump'` text never appears in `membrane.ts` (an imported constant, a runtime-built string, a template with substitutions) is not judged by the lint. The verifier showed the old gate also missed the template form. The int test sees such a bypass only at the async host door it exercises.
- Blindness. The gate refused a zero-site population on every static run. The successor's blindness check (the rule is configured for the membrane path, the real file lints clean, injected bypasses are caught) is in `tests/tooling`, which runs weekly. If `membrane.ts` moves, the per-push lint scope is empty until that test runs. The per-push int test still runs the real path wherever the file lives.
- Anchor positions for computed dump keys (`native-computed-names.int.test.ts`) were gate reporting detail and died with the gate.

Waivers and grants: 1 marker, inside the HEAD fixture text of `native-computed-names.int.test.ts:216` (`@orb-waive plugin-dump-guard(...)`), removed with that fixture case (removed-dead). `rg` finds no live `@orb-waive plugin-dump-guard`, no reviewed grant with that `policyId`, and no waiver-budget row.

## firehose-import-allowlist-health: done

Successor: `tests/tooling/verify/ops/security-native-boundaries.test.ts`, test `the firehose selector bans the real callable firehose name outside its two homes`. `FIREHOSE` is typed `satisfies keyof ServicesResult["liveBuses"]["chat"]` and bound to the named import of `subscribeAllChatEvents` from `@orb/server/transport/trpc` through `satisfies Record<typeof FIREHOSE, unknown>`. The binding is typed `(listener: never) => () => void`, so a rename, removal or non-callable twin fails the root `tsconfig.json` typecheck on every push. At runtime the test asserts `typeof firehose === "function"` and lints the import, re-export, member, computed and optional-chain spellings of that name through the effective `orb/firehose-import-allowlist` selector: 5 findings outside the homes, 0 in `entry/compose/automation-watcher.ts` and `transport/trpc/index.ts`. A drifted `FIREHOSE_SYMBOL` in `eslint.config.js` would make the 5 findings 0, because the selector is keyed on that constant. The occurrence boundary itself (the RESTRICTIONS row) is unchanged.

Plants:

Each shape replaced the declaration in `packages/server/src/transport/trpc/chat-events-bus.ts`, then `pnpm test:scoped tests/tooling/verify/ops/security-native-boundaries.test.ts -t firehose` ran:

| Shape (gate row) | Exit | Failure |
| - | - | - |
| `export const subscribeAllChatEvents = 0;` (mustFlag[1]) | 1 | `AssertionError: expected 'number' to be 'function'` |
| private `function subscribeAllChatEvents(): void {}` (mustFlag[2]) | 2 | `SyntaxError: The requested module './chat-events-bus.ts' does not provide an export named 'subscribeAllChatEvents'` |
| declaration removed (mustFlag[0]) | 2 | the same `SyntaxError` |

The file was restored byte-identical. A planted importer `packages/server/src/domain/chat/zz-rb3-firehose-plant.ts` (named import, namespace import, destructure, member read) through `pnpm exec eslint <plant>` exited 1 with `orb/firehose-import-allowlist` at `2:10` (named import) and `5:63` (member read). The plant was deleted.

Parity: 3 mustFlag / 3 mustPass ported, 0 lost. mustFlag[0] and mustFlag[2] break the named import at link time and at typecheck. mustFlag[1] fails the `typeof` assertion and the typed binding. The 3 mustPass forms (function declaration, factory projection, export rename) are accepted as forms. The binding is stricter on the signature: it requires a function that returns an unsubscribe, so the rows' literal `(): void` bodies would now fail the typecheck. The live declaration has the real signature.

Lost or narrowed claims:

- Canonical home. The gate also required the declaration to be authored in `chat-events-bus.ts`, not re-exported from another module. A move cannot blind a name-keyed selector, so that arm is not ported.
- Cadence. The declaration side is per-push (typecheck). The selector binding and `typeof` assertions are weekly (`tests/tooling`).

Waivers and grants: none. The inline `eslint-disable-next-line orb/firehose-import-allowlist` at `packages/server/src/transport/trpc/chat-events-bus.ts:66` belongs to the retained RESTRICTIONS row, not to this gate.

## firehose-import (fact producer): done

The fact's only consumer was the health gate. Its claim (a callable export named `subscribeAllChatEvents` authored at the canonical home) is carried by the same successor test. Parity: 0 mustFlag / 0 mustPass (a fact producer without rows), so parity is owed to primary. Lost claim: the canonical-home arm above. Waivers and grants: none. The `runtime-exports` native family keeps its other consumers (`verb-naming`, the KEEP `test-production-clone`); the fact store is untouched.

## Scaffolding removed

- `tooling/src/verify/gates/plugin-dump-guard.ts`, `tooling/src/verify/gates/_proof/quickjs.ts` (sole importer was the gate), `tooling/src/verify/gates/firehose-import-allowlist-health.ts`, `tooling/src/verify/lib/firehose-import-fact.ts`, `tests/tooling/verify/gates/firehose-import-allowlist-health.test.ts`. Its selector test moved into the security boundary test.
- Liveness entries in `tests/tooling/verify/gates/_liveness/server-app.ts`; the family entry and receipt test in `ordinary-visitors-family.suite.test.ts`.
- The plugin and firehose consumers in `native-policy-cases.ts`, `native-runtime-export-delivery`, `native-callable-delivery`, `native-member-consumers` and `native-computed-names`. Each keeps its remaining consumer.
- The dead `plugin-dump-guard.ts:89` cite in `policy-binding-resolution.ts`, and the reference-fact-call test comment. ADR 0162 names the new declaration-health home.
- Importer scan: ast-grep `import $$$ from "$P"` and `import("$P")` over `packages tooling tests scripts` (ts: 8,164 files; tsx: 1,653 files) found no import of a deleted module; a literal `rg` of the module paths over `packages tooling tests scripts .claude docs` and both ESLint configs found none.
- Three comments still name `plugin-dump-guard` as one of the three former hand-rolled callers that motivated `resolveCallableDeclaration` (`tooling/src/floor/code-facts/reference-fact-call.ts:69`, `tests/tooling/floor/code-facts/reference-fact-call.test.ts:5`, `tooling/src/verify/gates/TS-MORPH-CAPABILITIES.md:102`). They are history, not references; left for the doc owner.

## Checks run

All were run in this worktree, serially, at load average 16-58 on 24 cores.

| Command | Result |
| - | - |
| `pnpm test:scoped tests/server/infra/plugin-host/membrane.int.test.ts` | pass on the restored source (twice); exit 1 on an assertion under each of 7 mutants |
| `pnpm exec eslint --config eslint-hard.config.js --no-config-lookup --no-inline-config packages/server/src/infra/plugin-host/membrane.ts` | exit 1 under 7 plants (one with an inline disable), exit 0 under `other-handle`, exit 0 clean |
| `pnpm test:scoped tests/tooling/verify/ops/security-native-boundaries.test.ts -t dump` with the prior attempt's config | exit 1: the two ordering cases find 0 (red first) |
| `pnpm test:scoped tests/tooling/verify/ops/security-native-boundaries.test.ts` | 5 of 6 pass. `generated verification source retains both infra restrictions` fails identically with the HEAD config (`-t infra` run), so it is inherited |
| `pnpm test:scoped tests/tooling/verify/ops/security-native-boundaries.test.ts -t firehose` under 3 declaration plants | exit 1, 2, 2 as tabled above |
| `pnpm exec eslint packages/server/src/domain/chat/zz-rb3-firehose-plant.ts` | exit 1, `orb/firehose-import-allowlist` at 2:10 and 5:63; the destructure is unflagged |
| `pnpm test:scoped tests/tooling/verify/gates/ordinary-visitors-family.suite.test.ts` | 11 of 11 pass |
| `pnpm test:scoped tests/tooling/floor/code-facts/reference-fact-call.test.ts` | 19 of 19 pass (the first run's exit 1 was the working-tree guard catching a report edit made mid-run; the rerun exited 0) |
| `pnpm test:scoped tests/tooling/verify/ops/native-computed-names.int.test.ts` | 3 of 3 pass |
| `pnpm test:scoped tests/tooling/verify/ops/native-callable-delivery.int.test.ts` | 4 of 5 pass. `native helper mutation ...` fails with `TypeError: Cannot redefine property: getTypeChecker` at `native-policy-cases.ts:149`, the `finally` that redefines the non-configurable property set at HEAD `native-policy-cases.ts:80`; that code is unchanged here, so every `nativePolicyFixture` mode inherits it |
| `pnpm test:scoped tests/tooling/verify/ops/native-runtime-export-delivery.int.test.ts` | 5 of 7 pass. `repeated passes ...` fails with the same inherited `getTypeChecker` error. `missing services ...` times out at its 5 s default; the HEAD bytes of the test (with the HEAD firehose gate files put back for the run) time out identically, so it is inherited |
| `pnpm test:scoped tests/tooling/verify/ops/native-member-consumers.int.test.ts` | 4 of 6 pass. `native membership admission ...` fails `expected 2 to be 1` (`membership-write-fan`: native type fact context is unavailable); the HEAD bytes (with the HEAD plugin gate files put back) fail identically. `native command doors distinguish canonical DatabankOps ...` fails `expected [ 2, 2, 2, 2 ] to deeply equal [ 1, 1, +0, +0 ]` from the same `membership-write-fan` exit 2; its HEAD bytes timed out at 60 s, so that one has no HEAD verdict |
| `pnpm exec biome check <12 changed files> --diagnostic-level=error` | clean after one scoped `--write` format of the security test |
| `pnpm check:agents` | exit 1: 3 dead links in `docs/plans/test-foundation/design.md` to untracked reports, inherited; nothing from this shard |
| `flock <heavy.lock> env -C <wt> pnpm typecheck --config tsconfig.json` (run last) | exit 1 with 3 errors, all in files this shard does not touch: `tests/legacy/inference/_support.ts:201` (TS2322), `tests/legacy/server/domain/embeddings/_support.ts:299` and `tests/legacy/server/domain/search/_support.ts:296` (TS2554). Inherited from this base; no error in a shard file |

## Owed to primary

- The generated `docs/law/Core-Enforcement-Active-Gates.md` rows 144 and 215 for both gates (`pnpm check:ledgers-fresh`).
- `pnpm lint:eslint-scoped` on `eslint.config.js` and `membrane.ts`.
- `pnpm typecheck --config tooling/tsconfig.json` for the deleted tooling modules (the importer scan above found none).
- The real-corpus liveness suites (`real-corpus-liveness-*.suite.corpus.int.test.ts`), which read the edited `server-app.ts`.
- Parity for the rows-less `firehose-import` fact.
- A ruling on the weekly cadence of the dump-lint blindness check and the firehose selector binding.

## Findings for other owners

- P2, `orb/firehose-import-allowlist` (RESTRICTIONS row, not moved by this shard). The verifier's suspicion is confirmed. In the planted importer above, `const { subscribeAllChatEvents: destructured } = bus;` after `import * as bus from ".../chat-events-bus.ts"` drew no `orb/firehose-import-allowlist` finding, and a namespace import is not flagged. Scenario: a file in `transport/trpc/stream/` (same tier, so no tier rule fires) destructures the firehose off a namespace import and feeds a per-user surface, which is the D162 join-history leak. Minimal fix: add `ObjectPattern > Property[key.name='subscribeAllChatEvents']` and its `key.value` twin to the row's selectors. An `ObjectPattern` parent keeps the bus factory's own object literal clean.
- P3, `tests/tooling/verify/ops/security-native-boundaries.test.ts`: `generated verification source retains both infra restrictions` fails identically with the HEAD `eslint.config.js` (eight extra `orb/` rules are active on `infra/auth/*.gen.ts`). Inherited; not this shard's rule.

## Coupled risk

The native delivery suites now carry one consumer each. Their co-consumers (`verb-naming`, `audit-client-tests`, `membership-write-fan`) are MOVE rows in other shards. When those shards land, these suites lose their last gate subjects, and the `type-member-origins` and `callable-declarations` families need a KEEP or fixture consumer to stay tested.
