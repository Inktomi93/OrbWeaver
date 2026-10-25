# Server and root boundary qualification

The assigned implementations qualify within their stated scope at `e81e308737dd3806a58080ed5d7718bc17e9c61e`. No confirmed defect requires a source change. Main owns board closure.

## Outcomes

| Item | Implemented | Qualified | Unresolved |
| - | - | - | - |
| 1287 | The owner-conversion door exports neither mint. Domain adapters forward the supplied handle. | The runtime facade check, inert-handle checks, forged-grant checks and production accounting pass. Knip and root-program type assertions pass. | No item-specific failure. |
| 1315 | Native ESLint refuses computed dynamic imports in server, db and inference source. | Planted joined, concatenated and template specifiers fail. Literal controls pass. The kernel waiver applies only to its line. | No item-specific failure. |
| 1322 | Native rules confine host loaders. Duplicate refuses synthetic cards. Fork drops synthetic seats. | Planted loader cases fail. The production duplicate/fork and coupled handle suite pass. | Deliberate hostile source remains outside D335's threat model. |
| 1305 | Each root owns its instance id, log/request/trace rings and audit failure window. | Main's matching production-root test passes. Writers and debug readers receive the same root-owned state. | This does not remove every process-global object. |
| 1309 | Each root owns its wire-capture and turn-outcome rings. | A real generated turn appears only in its root's debug reads. Capture and outcome writers use the supplied rings. | On-disk spill placement remains a configured data-directory concern. |
| 1312 | Each root constructs its embeddings availability and announcement latches. | The second root attempts analysis after the first root receives an unavailable-model response. Native ESLint passes. | No item-specific failure. |

## Source evidence

### Owner and boot capabilities

`packages/db/package.json` maps `@orb/db/wiring-owner` to `packages/db/src/client/wiring-owner/index.ts:4`. That explicit export list contains recoveries and operand tokens, not `databaseHandle` or `bootDatabaseHandle`.

`packages/db/src/client/wiring-driver.ts:7` publishes physical admission. `packages/db/src/client/wiring-boot.ts:6` publishes the boot grant. `packages/db/src/client/wiring-capabilities.ts:44` registers admitted handles; `:51` creates a distinct boot grant; `:59` checks the grant registry before recovery. A copied or cast plain handle does not acquire boot authority.

The changed domain adapters recover and forward the same supplied identity:

- `packages/server/src/domain/character/persistence/handoff-copy-write.ts:82`
- `packages/server/src/domain/character/service.ts:43`
- `packages/server/src/domain/chat/context.ts:12`
- `packages/server/src/domain/chat/persistence/import-write.ts:841`
- `packages/server/src/domain/chat/persistence/token-usage-backfill.ts:78`
- `packages/server/src/domain/chat/verbs/generation-observation-sink.ts:9`
- `packages/server/src/domain/embeddings/verbs/record-usage.ts:9`
- `packages/server/src/domain/imagery/service.ts:17` and `:35`

The adapters recover `ctx.db` from that handle. Their accounting callers pass `ctx.db`, or `db` destructured from that context. The existing mutable batch operand also survives through `batchHandle`.

`.dependency-cruiser.ts:26` names boot importers. Its admission and capability-module rules at `:1017` through `:1043` constrain driver access, boot mint access, private-module access and the type-only contract. Production lifecycle mints the boot grant at `packages/server/src/entry/lifecycle.ts:282`; request composition receives the plain handle at `:439`.

### Computed imports and host loaders

`eslint.config.ts:297` defines `MODULE_LOADER_SYNTAX`. It refuses computed `ImportExpression` sources, the supported `getBuiltinModule` member/destructuring forms and `importModuleDynamically` properties. The source blocks at `:1761` and the seed block at `:1774` retain these entries.

`.dependency-cruiser.ts:998` confines `module` and `node:module`. The exceptions at `:32` name `entry/boot/migrate.ts` and `backends/agent-sdk/executable.ts`. Their current calls use `.resolve`, not module evaluation.

`packages/inference/src/backends/local-light/model-cache.ts:53` has the line waiver. Its comment correctly distinguishes module evaluation from the later shape check. The seam flows through composition options; `tests/support/node/server.ts:264` supplies it for tests. Production process boot supplies no kernel module. The waiver is not a module-sandbox claim.

### Synthetic duplicate and fork

The producer `packages/server/src/domain/character/verbs/mint-synthetic-group-character.ts:48` writes `synthetic: true`. The qualification therefore tests the stored marker, not a name or handle convention.

`packages/server/src/domain/character/verbs/duplicate.ts:58` loads the caller-owned source, then refuses a synthetic source before insertion. `packages/server/src/domain/chat/verbs/fork.ts:488` resolves live character seats through `seatableCharacterIds`. The query in `packages/server/src/domain/chat/persistence/seat-characters.ts:23` requires both the forker's owner id and `synthetic = false`.

The real transport forwards its resolved Principal at `packages/server/src/transport/trpc/routers/character.ts:108` and `packages/server/src/transport/trpc/routers/chat.ts:660`. The integration case at `tests/server/domain/character/persistence/handle-copies-and-restores.int.test.ts:312` constructs a production root, mints a group row through its production verb and plants a legacy seat directly. It checks not-found duplication, the retained ordinary seat and the absence of a visible group copy.

### Root-owned observability and latches

`packages/server/src/entry/compose/process-seams.ts:33` constructs the rings, logger and instance id. `packages/server/src/foundation/observability/rings.ts:17` creates fresh log/request/trace/capture/outcome containers. The harness constructs equivalent seeded seams at `tests/support/node/server.ts:595` and calls production `createServices`, not replacement domain services.

`packages/server/src/foundation/observability/audit.ts:113` closes over a fresh failure window and returns a copied snapshot. Lifecycle creates this wiring at `packages/server/src/entry/lifecycle.ts:283`. `entry/http/app.ts:106` forwards its failure reader and rings into the real HTTP app.

`packages/server/src/foundation/observability/tracing.ts:174` routes spans by the ring in their OTel context. `:287` binds that ring at each request root. The OTel provider and context manager remain process-global intentionally. The logger's AsyncLocalStorage and request-lifetime context discriminator also remain shared mechanisms, not shared retained records.

`packages/server/src/entry/compose/services.ts:462` and `:731` bind outcome and capture writers to `deps.rings`. The debug reads at `packages/server/src/foundation/observability/debug/routes.ts:364` through `:461` read those supplied rings and the supplied audit snapshot. These are privileged whole-root diagnostics, not tenant-scoped application reads.

`packages/server/src/domain/embeddings/service.ts:35` constructs the latches inside a factory. `packages/server/src/entry/compose/search-discovery.ts:161` invokes it for each graph. The availability Sets live inside `createAvatarAnalysisAvailability`; the degrade Set lives inside `createImageSpaceDegradeReport`. `indexer/caption.ts:80` and `indexer/image.ts:74` consume the injected latch. Neither latch file is exempted by `MODULE_STATE_OWN_PROCESS` at `eslint.config.ts:1714`.

`tests/server/foundation/observability/root-isolation.int.test.ts` drives real HTTP debug reads, the live stream-ready frame, an actual provider-backed turn and asset indexing. Its audit failure uses a native missing-table fault. Its model failure uses the external provider execution seam. It tests root isolation, not the absence of every server global.

## Verification

| Command | Result | Evidence |
| - | - | - |
| `git rev-parse HEAD` | Reviewed revision is `e81e308737dd3806a58080ed5d7718bc17e9c61e`. | Qualification worktree. |
| `pnpm worktree:bootstrap` | Exit 0; repository lifecycle completed. | Native command output. |
| `pnpm test:tools tests/tooling/eslint-computed-import.test.ts tests/tooling/native-compose-query-boundary.test.ts` | Exit 0; 28 tests pass. Includes planted violations and clean controls against installed native rules and production package doors. | Native command output. |
| `pnpm test tests/db/client/wiring-capabilities.int.test.ts tests/server/domain/character/persistence/handle-copies-and-restores.int.test.ts tests/server/entry/boot/persistence/forged-boot-grant.int.test.ts tests/server/domain/embeddings/persistence/runtime-accounting.int.test.ts` | Exit 0; 32 tests pass. | `/tmp/server-boundary-qualification-native.log` |
| `pnpm typecheck packages/db/tsconfig.json packages/server/tsconfig.json packages/inference/tsconfig.json` | Exit 0. Does not claim root-program type assertions. | `/tmp/server-boundary-qualification-typecheck.log` |
| `pnpm exec biome check packages/db/src/client/wiring-owner/index.ts packages/server/src/domain/character/verbs/duplicate.ts packages/server/src/domain/chat/persistence/seat-characters.ts packages/server/src/foundation/observability/rings.ts packages/server/src/entry/compose/process-seams.ts --diagnostic-level=error` | Exit 0; no fixes. | Native command output. |
| Main's `pnpm test tests/server/foundation/observability/root-isolation.int.test.ts` | Reused matching completed run; exit 0, 3 tests pass. | `/tmp/ui-closeout-root-isolation.log` |
| Main's `pnpm lint:eslint` | Reused matching completed run; exit 0, including source import restrictions and module-state lint. | `/tmp/ui-closeout-main-eslint-final.log` |
| Main's `pnpm depcruise` | Reused matching completed run; no violations across 6979 modules. | `/tmp/ui-closeout-main-depcruise.log` |
| Main's `pnpm knip` | Exit 0 after removing the unused `CorpusRead` public forwarding. Its internal owning type remains. | `/tmp/ui-closeout-main-knip-final.log` |
| Main's `pnpm knip:prod` | Exit 0; retained tag hints are informational. | `/tmp/ui-closeout-main-knip-prod.log` |
| Main's `pnpm typecheck tsconfig.json` | Exit 0, including the root-program type assertions and server router dependency. | `/tmp/ui-closeout-main-root-typecheck.log` |
| `pnpm doc format --write docs/reviews/server-boundary-qualification.md` and `pnpm doc format --check docs/reviews/server-boundary-qualification.md` | Exit 0. | Native command output. |

`git log`, `git show` and current-source comparisons confirm the implementation commits `ca21fa92a7`, `ce8b8a3e78`, `0a2bc73cd2` and `f2e7e386c8`. Their work items record red-first controls; those descriptions are historical evidence, not fresh runs. The synthetic implementation and its coupled test remain unchanged from `0a2bc73cd2`.

The literal census and TS/TSX `ast-grep` import checks cover the server source inventory of 1813 files. Neither finds a domain admission-mint import. The reviewed adapter bodies and accounting call sites establish the narrower connection-identity claim.

## Scope and handoff

The review covers the assigned work items, D335, D321, D333, identity/ownership law and the touched source boundaries. Full reads cover the capability implementation, facade, small adapters, duplicate/seat logic, latch factories and named suites. Larger-file review uses outlines and the relevant construction, copy, state-routing and reader regions. This is not a line-by-line review of all import persistence, fork projection, tracing serialization, service composition or ESLint configuration.

No new read surface, authentication flow or cryptographic primitive is introduced. Existing request Principal resolution and owner/membership gates remain assumptions of the focused behavior cases. The native import controls enforce accidental-author discipline under D335, not isolation from deliberately hostile repository code.

No additional human security review is required for this report. Whole-application CI remains outside this lane. No board file, index or production source changes belong to this report.
