## Lane identity

- Lane: `server-providers-backends`
- Semantic scope: server provider-backend implementations and their mirrored tests: Agent SDK, OpenRouter, custom OpenAI-compatible BYO, local-light inference, and shared backend kit.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`
- Working-tree basis: working-tree bytes; every owned digest equals `assignment.txt`.
- Assigned files read: 112 / 112 (100%).
- Assigned lines read: 20,870 / 20,870 text lines (100%).
- Assigned bytes read: 969,632 / 969,632 (100%).
- Dirty assigned paths: 0.
- Exclusions: no owned-path exclusions. Live paid-provider credentials, real Claude SDK subprocesses, and opt-in Hugging Face model downloads were not invoked.

## Read receipt

`read-receipt.tsv` covers all 112 `OWNED` rows in `assignment.txt`; every current SHA-256 equals its snapshot digest. Reconciliation was 0 missing files, 0 line/byte variance, and 0 hash mismatches (command receipt in `commands.md`).

## Architecture observed

The four factories implement the provider-backend boundary: Agent SDK at `packages/server/src/infra/providers/backends/agent-sdk/index.ts:88`, OpenRouter at `packages/server/src/infra/providers/backends/openrouter/index.ts:392`, custom BYO at `packages/server/src/infra/providers/backends/custom-byo/index.ts:33`, and local-light at `packages/server/src/infra/providers/backends/local-light/index.ts:32`. The provider registry composes all four at `packages/server/src/infra/providers/index.ts:130`, `:131`, `:132`, and `:137`; resolution-aware caller lenses establish R3 factory reachability.

Agent SDK owns subprocess environment isolation and auth routing (`packages/server/src/infra/providers/backends/agent-sdk/env.ts:188`, `:204`, `:239`), turn streaming (`packages/server/src/infra/providers/backends/agent-sdk/runner.ts:165`, `:375`), and resumable session state (`packages/server/src/infra/providers/backends/agent-sdk/session/store.ts:134`). OpenRouter splits account/catalog/client/credential handling from chat, embedding, image, and rerank runners (`packages/server/src/infra/providers/backends/openrouter/index.ts:392`, `packages/server/src/infra/providers/backends/openrouter/runners/chat/chat-completions.ts:291`, `packages/server/src/infra/providers/backends/openrouter/runners/chat/responses.ts:422`). Local-light places model lifecycle in its cache (`packages/server/src/infra/providers/backends/local-light/model-cache.ts:202`) and exposes embed/image-embed/rerank through its factory (`packages/server/src/infra/providers/backends/local-light/index.ts:32`). The shared kit supplies abort, retry, wire shaping, error classification, normalization, and cache-control seams (`packages/server/src/infra/providers/backends/kit/abort-flatten.ts:42`, `packages/server/src/infra/providers/backends/kit/retry.ts:89`, `packages/server/src/infra/providers/backends/kit/wire-schemas.ts:156`).

## Subsystem scorecards

| Subsystem (owned denominator) | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Agent SDK (17 implementation + 15 paired test files) | 4 | 3 | 3 | 3 | 3 | high | Factories/runner/session at `packages/server/src/infra/providers/backends/agent-sdk/index.ts:88`, `packages/server/src/infra/providers/backends/agent-sdk/runner.ts:165`, `packages/server/src/infra/providers/backends/agent-sdk/session/store.ts:134`; registry R3 at `packages/server/src/infra/providers/index.ts:131`; 20 firewall tests start at `tests/server/infra/providers/backends/agent-sdk/env.test.ts:29`; current narrow suite passed. |
| OpenRouter (13 implementation + 12 paired test files) | 4 | 3 | 3 | 2 | 3 | high | Factory at `packages/server/src/infra/providers/backends/openrouter/index.ts:392`; registry R3 at `packages/server/src/infra/providers/index.ts:130`; chat-completions assertions at `tests/server/infra/providers/backends/openrouter/runners/chat/chat-completions.test.ts:118`; contract assertions at `tests/server/infra/providers/backends/openrouter/runners/chat/shared.contract.test.ts:20`. |
| Custom BYO (3 implementation + 2 paired test files) | 4 | 3 | 3 | 2 | 3 | high | Factory at `packages/server/src/infra/providers/backends/custom-byo/index.ts:33`; registry R3 at `packages/server/src/infra/providers/index.ts:132`; request, streaming, redaction, and failure assertions at `tests/server/infra/providers/backends/custom-byo/runners/chat.test.ts:113`, `:393`, `:481`, `:549`. |
| Local-light (6 implementation + 11 paired test/fixture files) | 4 | 3 | 3 | 2 | 3 | high | Factory at `packages/server/src/infra/providers/backends/local-light/index.ts:32`; registry R3 at `packages/server/src/infra/providers/index.ts:137`; current lifecycle integration at `tests/server/infra/providers/backends/local-light/model-cache.int.test.ts:50`; role-level real-model tests are opt-in at `tests/server/infra/providers/backends/local-light/embed.int.test.ts:19`, `tests/server/infra/providers/backends/local-light/image-embed.int.test.ts:22`, `tests/server/infra/providers/backends/local-light/rerank.int.test.ts:17`. |
| Shared backend kit (16 implementation + 13 paired test files) | 4 | 3 | 3 | 2 | 3 | high | Consumers are each factory family; direct behavioral coverage includes retry at `tests/server/infra/providers/backends/kit/retry.test.ts:92`, wire streaming at `tests/server/infra/providers/backends/kit/openai-compat/stream.test.ts:1`, and cache placement at `tests/server/infra/providers/backends/kit/cache-control.test.ts:1`. |

## Findings

### SAPB-01 — Three real-model role checks have no current execution receipt

- Severity: P3
- Class: operability-gap
- Confidence: high
- Evidence rung: R4 for the role checks; R5 only for the separate local-light model-cache integration.
- Scope denominator: 3 of 4 owned local-light integration files; 6 of 648 direct-run test cases skipped.
- Receipts: `tests/server/infra/providers/backends/local-light/embed.int.test.ts:19`; `tests/server/infra/providers/backends/local-light/image-embed.int.test.ts:22`; `tests/server/infra/providers/backends/local-light/rerank.int.test.ts:17`; `tests/server/infra/providers/backends/local-light/model-cache.int.test.ts:50`; direct runner result in `commands.md`.
- Established fact: the direct integration run skipped the two embedding cases in each of three suites because each suite selects `describe.skip` unless `ORB_LOCAL_LIGHT_E2E=1`; the one executed integration case instead proves missing-model degradation and process survival.
- User or system impact: a regression in downloaded-model embedding, image embedding, or reranking can pass the default offline suite until an operator enables the download-gated check.
- What remains unverified: current inference behavior against the downloaded ONNX models (intentional external/network boundary), not factory wiring or cache crash handling.
- Suggested next check or fix: in a disposable environment with network access, run those three files with `ORB_LOCAL_LIGHT_E2E=1`; retain the existing gate rather than making normal CI download multi-GB models.

## Proven strengths

- **Credential firewall is meaningfully exercised (R4).** The OpenRouter skin rejects an empty API key at `packages/server/src/infra/providers/backends/agent-sdk/env.ts:204`; first-party Anthropic rejects an empty key at `:239`; paired tests exercise mode-4 isolation and rejection at `tests/server/infra/providers/backends/agent-sdk/env.test.ts:169`, `:186`, `:200`, and `:210`. The current direct behavioral suite included and passed that file (20 tests).
- **The owned factories are not declarations-only (R4).** All four have R3 registry composition at `packages/server/src/infra/providers/index.ts:130`, `:131`, `:132`, `:137` and their paired direct tests passed in the current 642-pass run.

## Declared versus completed

| Declared surface | Strongest current evidence | Status |
| - | - | - |
| Agent SDK backend factory | R4: factory `packages/server/src/infra/providers/backends/agent-sdk/index.ts:88`, registry `packages/server/src/infra/providers/index.ts:131`, current paired tests | completed in audited local scope; no live paid/host-subprocess execution |
| OpenRouter backend factory and role runners | R4: factory `packages/server/src/infra/providers/backends/openrouter/index.ts:392`, registry `packages/server/src/infra/providers/index.ts:130`, current unit + contract tests | completed in audited local scope; no live OpenRouter call |
| Custom BYO backend | R4: factory `packages/server/src/infra/providers/backends/custom-byo/index.ts:33`, registry `packages/server/src/infra/providers/index.ts:132`, current stream/redaction/error tests | completed in audited local scope; no arbitrary live endpoint probe |
| Local-light backend | R5 for cache-degradation integration at `tests/server/infra/providers/backends/local-light/model-cache.int.test.ts:50`; R4 for embed/image/rerank real-model suites | partially operationally proved; SAPB-01 bounds the unexecuted role checks |

## Tests and gates

The owned test set contains 49 unit files, 4 integration files, 1 contract file, and 3 support/fixture files. The direct, narrow run passed 51 files / 642 tests, skipped 3 files / 6 tests, and produced a fresh successful `reports/test-report.json`; see `commands.md`. Test quality includes substantive error and boundary assertions: malformed Agent SDK init frames at `tests/server/infra/providers/backends/agent-sdk/verify.test.ts:21`, BYO cross-origin redirect protection at `tests/server/infra/providers/backends/custom-byo/inspect.test.ts:93`, and OpenRouter 429 recovery at `tests/server/infra/providers/backends/openrouter/runners/chat/chat-completions.test.ts:465`.

The two membership gates passed: type membership covers 1,858 test files and execution membership covers 1,689 runner-view files; their receipts are in `commands.md`. No specialized owned-source enforcement gate was identified in lane scope, so enforcement scores remain 2–3 rather than implying an impossible-at-boundary property.

## Cross-lane edges

- The four factory calls in `packages/server/src/infra/providers/index.ts:130`, `:131`, `:132`, and `:137` are the live composition edge; ownership of registry composition and any end-to-end provider lifecycle proof belongs to the adjacent provider/entry lane, not this lane.
- The direct factory callers in `tests/server/domain/chat/wire-capture-fidelity.suite.int.test.ts:243`, `:258`, and `:279` are cross-lane integration evidence. They were located structurally but not assessed semantically because that test is not owned here.

## Tool receipts

The repository-native `pnpm ast` tool was read and used for resolution-aware exports, factory callers, importers/reaches, orphan detection, and test-only detection. The broad liveness command completed within 59.8 seconds after an initial 30-second poll (under the required 300-second allowance): no owned orphan export was reported; the sole test-only export is `buildClaudeAnthEnv` at `packages/server/src/infra/providers/backends/agent-sdk/env.ts:239`, whose direct tests use it at `tests/server/infra/providers/backends/agent-sdk/env.test.ts:169`. Literal factory-call search independently corroborated all four registry paths. No structural absence rests on direct ast-grep, so there is no TS/TSX scan-count claim to retain; the native workspace lens covers the source graph and the only owned TSX count is zero.

## Lane verdict

All 112 owned files reconcile to the snapshot and the narrow owned behavioral suite is green: 642 passed, 6 intentionally skipped.
The four backends are concretely composed in the provider registry and their main local error/boundary tests execute.
One bounded operability proof gap remains: three download-gated local-light role integrations have not produced a current R5 receipt.
No behavior defect, declared-not-wired surface, or owned orphan export was established in this snapshot.
