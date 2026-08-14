## Lane identity

- Lane: `server-search-refinery`
- Semantic scope: server-domain refinery workflow, regex-script library, retrieval search, and economics/statistics rollups, with their 104 paired executable/type tests.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`.
- Working-tree basis: current bytes; all 264 owned hashes, byte counts, and line counts still equal the manifest.
- Assigned files read: 264 / 264 (100%).
- Assigned lines read: 21,858 / 21,858 (100%).
- Assigned bytes read: 1,063,509 / 1,063,509 (100%).
- Dirty assigned paths: 0.
- Exclusions: transport routers, client implementations, shared composition roots, static/full-tree gates, CT/e2e, and live runtime are outside this lane. `unwired` can inspect their resolved relationships without reading or modifying their files.

## Read receipt

`read-receipt.tsv` covers every `OWNED` row in `assignment.txt` (264 rows) and its totals/hash triplets reconcile with the manifest and current bytes. See [commands.md](commands.md) for the full-byte barrier and drift check.

## Architecture observed

Each domain has a thin composition root which creates verb factories from a domain context and returns the contract service: refinery makes one stage engine and injects it into `runStage` and `iterate` ([service.ts](../../../../../packages/server/src/domain/refinery/service.ts:28), R3); search wires one `knn` instance into `findCharacters` and unified search ([service.ts](../../../../../packages/server/src/domain/search/service.ts:22), R3); stats constructs its process-local reconcile single-flight registry at service creation ([service.ts](../../../../../packages/server/src/domain/stats/service.ts:27), R3); and regex composes script and attachment verbs ([service.ts](../../../../../packages/server/src/domain/regex/service.ts:47), R3).

Regex keeps authorization at the owned persistence lookup: `getScript` searches by the caller user id and throws the same not-found error for absent/foreign ids ([get.ts](../../../../../packages/server/src/domain/regex/verbs/scripts/get.ts:9), R3). Its current direct integration test explicitly proves both the owned response and the indistinguishable foreign/absent failure ([get.int.test.ts](../../../../../tests/server/domain/regex/verbs/scripts/get.int.test.ts:12), R5).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | - | - |
| Refinery (38 source `.ts`, 24 paired runtime tests) | 4 | 4 | 4 | 3 | 2 | high | Composition/injected engine [service.ts](../../../../../packages/server/src/domain/refinery/service.ts:28); no orphan/test-only/prod-only export or unwired procedure in scoped AST scans; current direct behavioral run (103 files/385 assertions). |
| Regex scripts (44 source `.ts`, 31 paired runtime tests) | 4 | 3 | 4 | 3 | 2 | high | Composition [service.ts](../../../../../packages/server/src/domain/regex/service.ts:47); ownership read and test [get.ts](../../../../../packages/server/src/domain/regex/verbs/scripts/get.ts:9), [get.int.test.ts](../../../../../tests/server/domain/regex/verbs/scripts/get.int.test.ts:12); one client-wiring gap below. |
| Search retrieval (31 source `.ts`, 22 runtime + one type test) | 4 | 4 | 4 | 3 | 2 | high | Shared `knn` and dispatch composition [service.ts](../../../../../packages/server/src/domain/search/service.ts:22); no scoped AST orphan/test-only/prod-only export or unwired procedure; current type and behavioral receipts. |
| Stats rollups (33 source `.ts`, 26 paired runtime tests) | 4 | 4 | 4 | 3 | 2 | high | Explicit service-local single-flight [service.ts](../../../../../packages/server/src/domain/stats/service.ts:27); no scoped AST orphan/test-only/prod-only export or unwired procedure; drift suite ran in the current behavioral pass. |

Scores are bounded to the lane. The `2` operability scores do not assert a production defect; no assigned source establishes live health/recovery/observability behavior, and no live-runtime run was in scope.

## Findings

### SERVER-SEARCH-REFINERY-01 — P2 candidate: `regex.getScript` has no client consumer

- Severity: P2
- Candidate status: pending transport/client product-intent confirmation; do not promote to a repository defect without it.
- Class: declared-not-wired
- Confidence: high.
- Evidence rung: R3 for the server route/service; R5 for the current owned integration behavior; no client R3/R4 evidence.
- Scope denominator: the `unwired` lens enumerated 369 server procedures and identified one matching `regex` procedure; literal cross-check scanned 2,787 client/test `.ts`/`.tsx` files. It excludes non-TypeScript and dynamically-computed accesses.
- Receipts: `pnpm ast unwired regex --max 240` reports `packages/server/src/transport/trpc/routers/regex.ts:48` as `regex.getScript`; the service publishes the capability ([service.ts](../../../../../packages/server/src/domain/regex/service.ts:53)); its owner-safe behavior is implemented ([get.ts](../../../../../packages/server/src/domain/regex/verbs/scripts/get.ts:9)) and exercised ([get.int.test.ts](../../../../../tests/server/domain/regex/verbs/scripts/get.int.test.ts:12)). The independent dot/optional-dot/bracket/`Trpc[...]` literal search had zero matches; exact command and exit are in [commands.md](commands.md).
- Established fact: the repository’s typed router-vs-client structural diff sees no client proxy or `Trpc` inference consuming this procedure, while the service is implemented and its direct integration test passes.
- User or system impact: a client cannot presently invoke the single-script read through the standard tRPC client surface; code needing a detail fetch must rely on another route/data path or cannot perform the operation.
- What remains unverified: whether a deliberately non-TypeScript or dynamic consumer exists, and whether product intent deliberately leaves this procedure server-only. The transport router/client are cross-lane files and were not read here.
- Suggested next check or fix: the transport/client owner must first establish whether a detail consumer is required; if so, wire it to `regex.getScript`, otherwise document/remove the unused router procedure.

## Proven strengths

- Current direct behavioral verification passed 103 owned unit/integration/contract files with 385 assertions; the owned type test also passed. This is R5 evidence for the executed integration/contract surface, not a live-runtime claim. Representative assertion coverage includes the foreign/absent non-oracle rule ([get.int.test.ts](../../../../../tests/server/domain/regex/verbs/scripts/get.int.test.ts:26)).
- The two membership gates currently prove the repository includes all runner-suffixed test files in an execution view and all TypeScript test files in a type-program closure (R5 gate receipts; [commands.md](commands.md)).

## Declared versus completed

| Surface | Strongest current evidence | Status |
| - | - | - |
| Refinery service and stage-engine injection | R3: [service.ts](../../../../../packages/server/src/domain/refinery/service.ts:28); R5 current integration/contract run | composed and tested |
| Regex `getScript` | R3: [get.ts](../../../../../packages/server/src/domain/regex/verbs/scripts/get.ts:9); R5: [get.int.test.ts](../../../../../tests/server/domain/regex/verbs/scripts/get.int.test.ts:12) | implemented/tested, client-unwired candidate pending product intent |
| Search shared ranking/dispatch composition | R3: [service.ts](../../../../../packages/server/src/domain/search/service.ts:22); R5 current integration run | composed and tested |
| Stats read/reconcile composition | R3: [service.ts](../../../../../packages/server/src/domain/stats/service.ts:27); R5 current integration run | composed and tested |

## Tests and gates

The owned test tree has 10 unit, 92 integration, one contract, and one type test (the five remaining `tests/**` owned files are support helpers). The direct Vitest command selected only the four owned domain directories and passed all 103 runtime files/385 assertions; the type test separately passed. This gives behavioral R5 coverage over the executed integration/contract paths, including the stats drift property suite and refinery stage paths, but does not substitute for a current CT/e2e/live-runtime receipt. `tests-execution-membership` and `tests-membership` passed with repository-wide denominators recorded in [commands.md](commands.md); they prove runner/type membership, not behavior.

## Cross-lane edges

- `regex.getScript` is registered in `packages/server/src/transport/trpc/routers/regex.ts:48`, a transport-owned file. The client owner should reconcile the missing client proxy use or intended server-only posture. This lane did not inspect that file beyond the `pnpm ast unwired` receipt.

## Tool receipts

The repository-native `pnpm ast` instrument was read and run bare before analysis. Resolution-aware `orphans`, `testonly`, and `prodonly` each returned no results within all four domain scopes; `unwired` returned no refinery/search/stats result and exactly the regex procedure above, with a 369-procedure provider denominator. The only absence claim about that procedure has an independent literal check over 2,787 `.ts`/`.tsx` client/test files, including dot, optional-dot, bracket, and `Trpc` forms. All structural commands completed; none timed out. Full commands, exits, durations, and exclusions are in [commands.md](commands.md).

## Lane verdict

All 264 owned files reconcile to the snapshot and their paired test surface is currently green (103 runtime files/385 assertions plus the type test). The four services have live internal composition; native lenses returned no refinery/search/stats reachability candidates, but those clean outputs are not promoted to proven absence without independent corroboration. Regex has one concrete wiring fact: `getScript` is a registered, tested server capability with no detected typed-client consumer. Whether that fact is a P2 defect remains a cross-lane product-intent question. No live runtime, CT/e2e, or cross-lane transport/client intent was asserted.
