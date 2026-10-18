# 1056: default Knip adjudication

Before-run: `pnpm knip` on 18b1d17c7d, 15s, exit 1: 2 files, 1 dependency, 4 devDependencies, 42 exports, 20 types, 3 config hints. After-run: 5 escalate rows plus one cascade orphan (see Open).

Search method for every symbol row: `rg -w` over the repo excluding node_modules and docs (repo-wide hit count shown by the finding's own definition line only), `ast-grep -l ts` and `-l tsx` over tooling, tests, scripts, packages and playwright (10453 tracked ts/tsx files in those dirs, 1654 tsx), codegraph_explore on the file, and a whole-file read. `pnpm ast` was not run: the owner rule forbids whole-repo `pnpm ast`.

## Files and hints

| Finding | Disposition | Evidence |
| - | - | - |
| tooling/src/verify/contract/grant-liveness.ts | removed | `GrantFinding` has no reference in 10453 files; lib/grant-liveness.ts uses `Finding` from contract/gate.ts:4 |
| tooling/src/verify/gates/_proof/intl.ts | wired | tests/tooling/verify/ops/_fixtures/native-origin-policy-proofs-b.ts now spreads `intlLookalikeProof()` / `intlNestedProof()`; the fixture rows' `why` already cites the file; native-origin-policy-corpus.test.ts passes |
| knip.ts ignoreUnresolved (3 hints) | removed | only importer is the gitignored, Knip-fenced sillytavern-runtime/public/script.js; no tracked file names the paths |

## Dependencies

| Finding | Disposition | Evidence |
| - | - | - |
| root devDependency drizzle-kit | removed | importers: tooling/src/verify/ops/db-baseline-parity.ts:109, tests/support/node/db.ts:17, packages/db/drizzle.config.ts:10, each workspace declares it (tooling/package.json:262, tests/support/package.json:220, packages/db/package.json:30); `check:drizzle-kit` runs `--filter @orb/db exec` |
| root devDependency postcss-value-parser | removed | sole importer tooling/src/verify/lib/stylelint-css-rules.ts:3; tooling/package.json:246 |
| root devDependency typeid-js | removed | importers packages/kit/src/ids/index.ts:8 (packages/kit/package.json:79) and tests/support/iso/ids.ts:9 (tests/support/package.json:226) |
| root devDependency @anthropic-ai/sdk and tests/support dependency | escalate | no import anywhere (comment only, packages/inference/src/backends/wire/anth-image-block.ts:4), but pnpm-workspace.yaml:223-226 pins it as the peer of @anthropic-ai/claude-agent-sdk (pnpm-lock.yaml peer `>=0.93.0`); removing it and its catalog row changes peer resolution to an unpinned version. Needs an owner decision: remove all three and accept the float, or keep with a scoped `ignoreDependencies` |

pnpm-lock.yaml importer rows for the three removed devDependencies were rewritten by pnpm itself; no `pnpm install` was run.

## Exports and types

| Finding | Disposition | Evidence |
| - | - | - |
| json-column-read.ts isParsedValue, isReturnedParsedValue, isWriteSink, bindingUsesJudged | removed | one definition hit each; gate uses the `*With` variants (gates/json-column-read-parsed.ts:21). Orphaned `NATIVE_PARSE_READERS`, `nativeReadReaders`, `writesColumn` and their imports removed |
| json-column-read.ts isDirectParseWith, RowModels | unexported / removed | local use at json-column-read.ts:39; RowModels re-export had no consumer |
| json-column-writers.ts collectJsonWritersByColumn | removed | wrapper of `collectJsonWritersByColumnWith`, which json column write fact uses |
| zod-output-twin.ts zodTypeReferenceIdentity, readAnnotatedZodOutputTwin, readExpressionZodOutputTwin, typeNodeIdentifierSymbols | removed | gate aliases the `*With` exports (gates/zod-output-twin-parity.ts:26-29); orphaned `SyntaxKind`, `ObservedReference` imports removed |
| tenancy-join.ts predicateMayReadColumn, predicatesContained, selectsByValue, conjunctLeaves, chainTermsOf | removed | no callers; the bounded owner-read rewrite (commit d0d0bd8135) stopped using them. Orphans removed: `columnOf`, `ColumnRead`, `factMayReadColumn`, `factLeaves`; `readsTable` unexported |
| tenancy-pin.ts membershipPinColumns, valuePinTerm, parentReadOf, currentMemberRoomPinned; valueSourcesOf | removed / unexported | same commit; only users were each other; valueSourcesOf used locally by `isPlainValue` |
| Orphans from the above: tenancy-read.ts predicatesReadColumn, tenancy-scope.ts foreignKeysBetween, contract/tenancy.ts ChainTerm, ValuePinTarget, ForeignKeyParentRead, ForeignKeyColumns, ConjunctLeaves, ReadStatement | removed | single definition hit each after the deletions |
| comment-spans.ts codeIncludes; repo-paths.ts gitChangedPaths; open-json-vocabulary.ts unwrap | removed | single definition hit; unwrap importers of that module name other symbols (open-json-parity-fact.ts:32, open-json-reader-shapes.ts:15, open-json-row-origin.ts:6) |
| static-class-semantic.ts classMeaningfulTypes | unexported | used at lines 84, 100 |
| client-vendors.ts tanstackFormProof, trpcProxyProof, LOOKALIKE_HOME | removed / unexported | single hits; gates inline their own vendor text; orphaned form-core and tRPC fixture text removed |
| contract/bus-fact.ts describeBusFactFailure, BUS_PROVIDER_KINDS, BusNonReadyFact; contract/fact.ts GateFactInput; contract/ordinary-waiver.ts OrdinaryWaiverReconciliationInput; compose-query-capability.ts QUERY_FREE_BOOT_MODULES; gate-authority.ts WAIVER_BUDGET_POPULATIONS; test-import-door.ts TEST_IMPORT_DOOR_KINDS; contract-structural-copy.ts MIN_COPY_FIELDS, TYPE_AGREEMENT_FLOOR; testid-registry.ts STORY_TESTID_REGISTRY_CONST; testid-value.ts TESTID_ATTRIBUTE, freeformTestidValue; stage-wait.ts PROD_STAGE_WAIT_DEPS | unexported | each is used inside its own file; no other consumer |
| contract/schema-fact.ts (9 type names), policy-scope.ts CompilerConfigEntries, contract/type-member-origin.ts ContextualMemberOrigin, TypeMemberOrigin | removed from re-export | no consumer. SchemaColumn was kept: its only consumer used `import("...").SchemaColumn`, which Knip does not read, so json-column-origin-context.ts:11 now imports it by name |
| tests/server/domain/notifications/_fixtures.ts clearInbox; tests/tooling/_edit-hook-fixture.ts CODEX_HOOK_REL; tests/e2e/support/trpc.ts TrpcPath re-export | unexported / removed | used in own file (_fixtures.ts:131, _edit-hook-fixture.ts:96); TrpcPath still imported at trpc.ts:19 |
| tests/legacy/server/domain/chat/engine/_pipeline-support.ts cachedHead | escalate | legacy `_support` file, fenced to lane 977 |
| tests/legacy/server/domain/rpg/_field-reachability-support.ts extraction | escalate | legacy `_support` file, fenced to lane 977 |
| tests/legacy/server/domain/chat/_scenario.ts SendOptions | escalate | legacy test-support file next to the fenced set; left unchanged to avoid a 977 collision |

## Open

- Confirming `pnpm knip` (21 s, exit 1, reports/cb-1056-knip-after.txt): residue is exactly the escalate rows above (@anthropic-ai/sdk x2, cachedHead, extraction, SendOptions) plus `TenancySchema` (contract/tenancy.ts:43), orphaned by the removals. TenancySchema was then removed (single definition hit; tooling typecheck passes). That last removal is not covered by a third Knip run.
- tests/tooling/floor/code-facts/drizzle-statement.test.ts shows 58 failures (timeouts at 5000 ms and by-id findings that are empty). No removed symbol is referenced by that gate path (tsc for tooling passes), and commit d0d0bd8135 records the same suite as red; not proven against a clean tree.
- tests/tooling/verify/gates/zod-output-twin-parity.suite.test.ts mustFlag arm times out at 5000 ms (7.9 s) under load; its other 14 tests pass.
