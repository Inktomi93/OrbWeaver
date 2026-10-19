# 981 type-home slice: native placement owns every authored plane in its population

## Outcome

ESLint `orb/type-home-direct-export` now judges export-listed aliases and interfaces and proven zod shape schemas (`object`, `enum`, `discriminatedUnion` through the `zod` door), not only direct declarations. It does this across its whole admitted population: inference, default-content, plugin-toolchain, server domains and the entry, transport, infra and foundation tiers. The custom family (`no-inline-types`, `no-inline-domain-interface`, `no-inline-package-interface`) subtracts that population instead of judging it twice. Generated declarations and domain test mirrors stay custom. The census found no finding in the newly covered planes. Leg 2 repaired the 16 type-home findings native lint already reported on main, under D329 and D324; the native population now lints clean.

## Coverage matrix

Kinds: D = direct exported alias/interface, L = export-listed alias/interface, S = exported zod shape schema, G = generated declaration.

| Population | Before | After |
| - | - | - |
| inference, default-content, plugin-toolchain `src/` | D native; L, S custom | D, L, S native; G custom |
| server domains | D native; L, S custom | D, L, S native; G and test mirrors custom |
| server entry/transport/infra/foundation | D, L native (D324); S custom | D, L, S native; G custom |
| server primitives | home by population algebra; no gate | unchanged |
| kit, contracts, db | homes; direction by package deps and dep-cruiser | unchanged |
| client | aliases and S custom; wire-named interfaces custom | unchanged |
| ui | generated tokens and token authoring custom | unchanged |
| tooling (outside `floor/`) | aliases and S custom; interfaces unjudged | unchanged |
| tests | aliases and S custom outside test homes | unchanged |
| scripts, showcase-plugins, plugin-sdk | unjudged | unchanged |

Covered-cell evidence:

- Native admission: `tooling/src/floor/code-facts/type-home.ts:65` (source globs), `:70` (contract homes), `:24` (unadmitted), `:102` (`nativeTypeHomeAdmission`).
- Native rule: `eslint.config.js` `typeHomeDeclarationRule`; it uses `nativeDeclarationExported` for D and L, and `isZodShapeCall` (`tooling/src/floor/code-facts/shape-declaration.ts:55`) for S.
- Custom subtraction: `tooling/src/verify/lib/type-home-policy.ts` `declarationHasSuccessorHome`.
- Custom populations: `tooling/src/verify/gates/no-inline-types.ts:83`, `no-inline-wire-interface.ts`, `no-inline-domain-interface.ts`, `no-inline-package-interface.ts`.
- Package direction: each `packages/*/package.json` and `.dependency-cruiser.cjs`.

## Census of the newly covered planes

- L: a syntax-only TypeScript scan of the 10,461 tracked TS/TSX files under `packages`, `tooling`, `tests` and `scripts` found zero local type declarations exported through an export list. Second method: `rg` for bare `export { … }` lines found 21 lines in 10 files, all inside test template-literal fixtures or `export {}` in `plugin-sdk` declarations.
- S: ast-grep over the four native roots (TS; TSX returned 0) found 69 exported call-initialized consts. None has a zod shape factory as its terminal call; the regex matches were tRPC routers. Second method: a multiline `rg` for exported `z.object/enum/discriminatedUnion/strictObject` outside contract homes returned 0 across 255 files with exported consts.

No native lint ran over the real population (see Deferred).

## Red and green

| Command | Result |
| - | - |
| `pnpm test:scoped tests/tooling/verify/ops/type-home-native.test.ts`, new claims on unmodified source | RED: 5 of 7 failed, each at the new claim (listed export 0 not 1; schema 0 not 1). Slot `reports/runs/test/agent-a3b507293a24a0020-1324829-2026-10-18T23-48-33-224Z`. |
| `pnpm test:scoped tests/tooling/verify/ops/type-home-native.test.ts tests/tooling/floor/code-facts/server-factory-type-home.test.ts` after the change | type-home-native 7/7 PASS. server-factory-type-home 6/7 PASS; the Hono projection test timed out at 15 s. Slot `reports/runs/test/agent-a3b507293a24a0020-1452555-2026-10-19T00-04-40-212Z`. |
| The Hono test alone | Timeout at 20 s, load average 14.9. It builds a Program over installed Hono and runs no ESLint; the only change on its path is a function rename. No verdict. |
| `pnpm test:scoped tests/tooling/verify/gates/ordinary-visitors-family.suite.test.ts` | 12/12 PASS (with the first combined run). |
| `pnpm test:scoped tests/tooling/floor/code-facts/shape-consumers.suite.test.ts -t 'migrated shape policy consumers'` | PASS: every mustFlag/mustPass row of the four family gates holds. |
| `pnpm typecheck --config tooling/tsconfig.json` | PASS. |
| `pnpm typecheck --config tsconfig.json` | FAIL only at four existing legacy sites, none touched: `tests/legacy/inference/_support.ts:201`, `tests/legacy/server/domain/chat/_support.ts:528`, `tests/legacy/server/domain/embeddings/_support.ts:299`, `tests/legacy/server/domain/search/_support.ts:296`. |
| `pnpm exec biome check <changed files> --diagnostic-level=error --write` | PASS. |

The schema test plants direct, multi-declarator, namespace-computed and renamed-export spellings (positive), and `z.string()`, unexported, shadowed and unbound factories (negative), in every native root and its real contract home.

## Repairs and row moves

There were no production repairs; the census found no finding. Custom proof rows whose subject moved to native were relocated to populations that stay custom (client, tooling) or rebuilt on generated files. A new `no-inline-types` pass row proves the subtraction. The `/scripts/` substring row moved into the native suite. Three liveness arms now plant still-custom subjects: `tests/tooling/verify/gates/_liveness/multi-root-b.ts` and `server-app.ts`. The multi-root-b arms were already stale before this change: they planted native-owned direct declarations and quoted a removed message.

## Decisions

- Declaration-kind slice over a package slice. The larger unjudged populations are client, ui and tooling, and each needs a law ruling before a path rule can judge it (see Next slice).
- The shared factory set stays as it is for parity. `zod-modern-spellings` steers authors to `strictObject`, which no placement owner treats as a shape. Widening the set exposes `tests/legacy/ui/art/web-weave/web-weave-glow-probe.ts:3`, a legacy CT support module.
- The policy id stays `type-home-direct-export`; it is a cache and suppression identity. The helper was renamed to `nativeTypeHomeAdmission` because it now admits every plane.

## Leg 2: native homes agree with the law, and the native population lints clean

Native lint over the four native roots first reported 16 type-home findings already on main. They were in `entry/contract/portability.ts`, `entry/http/contract/assets.ts`, `foundation/data-layout/contract.ts`, `entry/http/blob.ts` (`PrincipalEnv`) and `transport/trpc/router.ts` (`AppRouter`, waived only for custom). D324 and D327 sanction no generic server contract folder, so native homes were not widened by folder.

- D329 (`docs/adr/0329-data-layout-and-portability-registry-type-homes.md`) names four exact homes: the data-layout contract, the portability registry shapes, `entry/http/contract/request-env.ts` and `transport/trpc/router.ts`. §7.4 holds the rows. Native admission uses `SERVER_EXACT_CONTRACT_HOMES` and `SERVER_TYPE_API_HOMES` (`tooling/src/floor/code-facts/type-home.ts`).
- `BlobAssetsPort` and `UploadAssetsPort` moved beside `registerBlob` and `registerUpload` under D324; `entry/http/contract/assets.ts` is deleted. `PrincipalEnv` moved to the request-env home; its importers repoint, and `entry/http/index.ts` keeps the type export. The `AppRouter` and `PrincipalEnv` waivers are deleted.
- Planted controls (`tests/tooling/verify/ops/type-home-native.test.ts`): the four exact homes pass. Sibling files stay findings: `data-layout/layout.ts`, `data-layout/contract/probe.ts`, `foundation/arbitrary/contract.ts`, `entry/contract/wrong.ts`, `entry/http/contract/assets.ts`, `entry/http/blob.ts`, `transport/trpc/routers/chat.ts` and `transport/trpc/router-probe.ts`.
- The first `no-inline-package-interface` pass row now plants paths native lint does not admit. An in-memory clause-drop probe reds the row for each claimed clause; `**/contract/**` reds as a tool error through the inference contract-home refusal.
- `TYPE_HOME_INPUTS` is the import closure of the type-home and tier-reference rule modules, computed by `toolingModuleClosure` (`tooling/src/floor/code-facts/instrument-reach.ts`). It includes `call-supplied.ts`, `schema-object.ts` and `reference-fact-call.ts`; a test pins these. It costs one closure walk per config load, about 0.8 s at load average 15.

| Command | Result |
| - | - |
| `systemd-run --user --scope -p MemoryMax=10G pnpm exec eslint --no-cache --format json` over `packages/server/src`, `packages/inference/src`, `packages/default-content/src`, `packages/plugin-toolchain/src`, before the leg 2 repairs | 2,025 files, no fatal, 9:00 wall, peak RSS 8.99 GB. 2 type-home findings remained after the D329 first pass (`blob.ts:75`, `router.ts:95`). |
| The same command after leg 2 | 2,026 files, no fatal, 6:07 wall, peak RSS 6.94 GB. Zero `orb/type-home-direct-export` findings. |
| `pnpm test:scoped` type-home-native, shape-consumers suite, ordinary-visitors-family | 28/28 PASS. |
| `pnpm typecheck --config packages/server/tsconfig.json`, then `tooling/tsconfig.json` | PASS, PASS. |
| `pnpm check:agents` | Only the three dead `reports/review` links in `docs/plans/test-foundation/design.md`, which this lane does not touch. |

Findings left on main, outside this brief, for the orchestrator to file. `orb/server-factory-tier-reference` has 15 placement findings:

- `packages/server/src/domain/assets/verbs/materialize-background.ts:6` `ImageRejectReason` from `infra/network/image-guard.ts`
- `packages/server/src/domain/discovery/verbs/analyze.ts:16` `StructuredLane` from `foundation/observability/structured-retry.ts`
- `packages/server/src/domain/discovery/verbs/distill.ts:32` `StructuredLane`
- `packages/server/src/domain/import/loader/import-bundle.ts:5` `ZipByteSource` from `infra/storage/zip.ts`
- `packages/server/src/domain/refinery/substrate/schema-forge.ts:23` `StructuredLane`
- `packages/server/src/domain/refinery/verbs/run-stage.ts:57` `StructuredLane`
- `packages/server/src/domain/refinery/verbs/score-sweep.ts:46` `StructuredLane`
- `packages/server/src/domain/refinery/verbs/test-schema.ts:12` `StructuredLane`
- `packages/server/src/entry/compose/service-jobs.ts:9` `CatalogRefreshSchedulerDeps` and `ScheduleOp` from `transport/jobs/catalog-refresh-scheduler.ts`
- `packages/server/src/entry/compose/service-jobs.ts:9` `WorkloadScheduleSchedulerDeps` and `ScheduleOp` from `transport/jobs/workload-schedule-scheduler.ts`
- `packages/server/src/entry/index.ts:19` `ImageRejectReason` and `PluginGitSourceDeps` from `infra/network/plugin-git.ts`
- `packages/server/src/entry/index.ts:20` `StructuredLane`

The same rule also has 1,297 explicit "cannot be established" refusals. `orb/brand-in-name-position` has one finding at `packages/server/src/domain/assets/contract/import-owned.ts:12` (bare `assetId`). `docs/work/1042-placement-gates-exclude-server-factory-shapes.md` still says `PrincipalEnv` keeps its Hono limitation; D329 now resolves that.

## Deferred

- Real-corpus liveness suites for the three edited arms.
- A quiet rerun of the Hono projection test in `tests/tooling/floor/code-facts/server-factory-type-home.test.ts`, which timed out under load in both legs.
- Retiring `no-inline-domain-interface`, whose only subject is generated domain interfaces.
- `pnpm doc index` is not needed: the ADR kept its minted title.

## Next slice

Tooling outside `floor/`: 258 exported interfaces outside `contract/` have no placement judge (aliases are already custom). Core-Tooling-Law section 2.5 names `contract/` as the shape home, but nothing rules on helper-option and result shapes in `lib/` and `ops/`. That needs a D324-style ownership ruling for tooling before a native rule can judge them. Client and ui need component-ownership semantics, not a path rule. Scripts are exempt as the research zone (Core-Tooling-Law section 2.7).
