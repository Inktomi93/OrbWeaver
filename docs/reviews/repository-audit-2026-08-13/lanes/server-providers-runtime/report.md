# Server providers runtime audit

## Lane identity

- Lane: `server-providers-runtime`
- Semantic scope: provider contracts, the sealed role dispatcher/firewall, vLLM backend lifecycle/request surfaces, and their 40 assigned direct test/support files.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`
- Working-tree basis: current bytes, reconciled 2026-08-13. Four owned paths have snapshot drift; see SPR-02.
- Assigned files read: 86 / 86 (100%)
- Assigned lines read: 11,565 / 11,565 current text lines (100%; snapshot denominator 11,552)
- Assigned bytes read: 555,483 / 555,483 current bytes (100%; snapshot denominator 554,590)
- Dirty assigned paths: 4 — `packages/server/src/infra/providers/vllm/engine/build-argv.ts`, `packages/server/src/infra/providers/vllm/engine/wake-budget.ts`, `tests/server/infra/providers/vllm/engine/build-argv.test.ts`, `tests/server/infra/providers/vllm/engine/wake-budget.test.ts`.
- Exclusions: all provider backends, entry composition, settings/env, physical GPU/vLLM processes, integration/CT/e2e suites, and shared audit controls are outside ownership. A read-only composition edge is cited where needed.

## Read receipt

`read-receipt.tsv` has one current line/byte/SHA-256 receipt for every one of the 86 `OWNED` rows in `assignment.txt`; coverage is 100%. The initial snapshot hash reconciliation found the four dirty paths above, all reread against their current bytes.

## Architecture observed

The public provider root binds all eight inference roles into one `ProviderExecutor` at `packages/server/src/infra/providers/index.ts:30-40`; it creates the four always-registered backends and conditionally registers vLLM at `packages/server/src/infra/providers/index.ts:125-148`. The executor has one boot caller, `packages/server/src/entry/compose/services.ts:319`, proved by `pnpm ast callers createProviderExecutor --in packages/server/src` (R3).

Every role must run the firewall before resolving a sealed backend, e.g. `packages/server/src/infra/providers/roles/embed.ts:12-21`; the policy matrix at `packages/server/src/infra/providers/roles/firewall.ts:11-21` rejects unspecified source×role pairs and lack of explicit owner consent. Dispatch derives API/source pairs with exhaustive failure paths at `packages/server/src/infra/providers/roles/dispatch.ts:25-84`, then `runRole` opens the provider span and flattens abort reasons at `packages/server/src/infra/providers/roles/dispatch.ts:126-157`.

The vLLM backend joins chat, embed, rerank, image-embed, summarize and structured surfaces to one lifecycle handle at `packages/server/src/infra/providers/vllm/index.ts:66-91`; its factory wiring is reached from the registry at `packages/server/src/infra/providers/index.ts:140-148`. Current launch argv makes the generation model alias primary, configures the thinking/template/tool parsers, and pins GPU topology in `packages/server/src/infra/providers/vllm/engine/build-argv.ts:274-379`; wake budgeting mirrors the rerank device choice at `packages/server/src/infra/providers/vllm/engine/wake-budget.ts:66-74`.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | - | - |
| Provider contracts and sealed dispatch (owned root/contract/role source files) | 4 | 3 | 4 | 3 | 3 | high | `packages/server/src/infra/providers/index.ts:30-40`; `packages/server/src/infra/providers/roles/dispatch.ts:25-157`; `tests/server/infra/providers/roles/dispatch.test.ts:88-229`; exact owned Vitest run (432/432). |
| Credential firewall (1 source, 1 direct test) | 4 | 3 | 4 | 3 | 3 | high | `packages/server/src/infra/providers/roles/firewall.ts:11-49`; `tests/server/infra/providers/roles/firewall.test.ts:25-128`; exact owned Vitest run. |
| vLLM factory, engine lifecycle, and surfaces (24 assigned source, 22 direct test files) | 4 | 3 | 4 | 2 | 2 | high | `packages/server/src/infra/providers/index.ts:108-148`; `packages/server/src/infra/providers/vllm/index.ts:66-91`; `packages/server/src/infra/providers/vllm/engine/build-argv.ts:274-379`; `tests/server/infra/providers/vllm/engine/build-argv.test.ts:147-343`; SPR-01. |

## Findings

### SPR-01 — P2 candidate: local vLLM behavior has no owned integration, CT, or live-runtime receipt

- Severity: P2
- Candidate status: pending the integration/probe lanes; do not promote to a repository defect without that reconciliation.
- Class: operability-gap
- Confidence: high within the owned lane; repository-wide absence is not established until the integration/probe lanes are audited.
- Evidence rung: R4
- Scope denominator: 24 assigned vLLM source files and 22 assigned vLLM direct test files.
- Receipts: `packages/server/src/infra/providers/vllm/index.ts:48-52` labels fallback configuration as test/GPU-less; `packages/server/src/infra/providers/vllm/engine/build-argv.ts:274-379` encodes real launch flags; `tests/server/infra/providers/vllm/engine/build-argv.test.ts:147-343` asserts argv snapshots; `tests/server/infra/providers/vllm/engine/client.test.ts:1-186` uses controlled client behavior; exact owned Vitest run passed 432/432.
- Established fact: the owned suite directly proves request shaping, launch configuration, supervisor decisions, and failure handling at unit/type level, but it did not start a vLLM process or prove an HTTP model turn against the declared deployment. Whether another owned integration/probe lane supplies that receipt remains open.
- User or system impact: a template/parser/flag or GPU-topology incompatibility can survive this lane's green suite until an operator starts the local fleet.
- What remains unverified: current vLLM version acceptance of the emitted flags, actual multi-GPU placement, model-template behavior, engine health/recovery, and end-to-end role dispatch against a live model.
- Suggested next check or fix: run the repository's approved GPU-backed integration/live probe in its owning integration lane with the current staged launch config, recording engine health and one chat/embed/rerank request. Do not count a static gate as substitute evidence.

## Audit state

### SPR-02 — Assignment snapshot drifted for four owned vLLM files

- Confidence: high
- Evidence rung: R1
- Scope denominator: 86 assigned files; 4 mismatched current SHA-256 receipts.
- Receipts: `docs/reviews/repository-audit-2026-08-13/lanes/server-providers-runtime/assignment.txt:27`, `docs/reviews/repository-audit-2026-08-13/lanes/server-providers-runtime/assignment.txt:43`, `docs/reviews/repository-audit-2026-08-13/lanes/server-providers-runtime/assignment.txt:69`, and `docs/reviews/repository-audit-2026-08-13/lanes/server-providers-runtime/assignment.txt:83` record the old lines/bytes/hashes; `docs/reviews/repository-audit-2026-08-13/lanes/server-providers-runtime/read-receipt.tsv:1` records the reread current values. The staged diff changes argv/template/topology and mirrored direct tests in those paths.
- Established fact: the lane’s declared snapshot is 11,552 lines / 554,590 bytes, while the complete current receipt is 11,565 lines / 555,483 bytes.
- Audit impact: a synthesis that assumes the original assignment hashes are current can attach conclusions to stale bytes.
- What remains unverified: whether another lane refreshes the global manifest before synthesis.
- Required synthesis handling: consume the current receipt for this lane and label its conclusions as working-tree based; do not rewrite the frozen assignment as if the original bytes never existed.

## Proven strengths

- The dispatcher rejects missing backend registrations and missing role implementations rather than invoking undefined behavior at `packages/server/src/infra/providers/roles/dispatch.ts:91-124`; direct tests assert both cases at `tests/server/infra/providers/roles/dispatch.test.ts:88-112` (R4).
- The firewall denies source/role mismatches and non-consented owner credentials at `packages/server/src/infra/providers/roles/firewall.ts:11-49`; matrix and error-semantics tests cover allowed and denied cases at `tests/server/infra/providers/roles/firewall.test.ts:25-128` (R4).
- The common role seam both records provider timing and prevents an abort reason containing transport terms from being reclassified/retried at `packages/server/src/infra/providers/roles/dispatch.ts:126-157`; the real embed/structured dispatcher tests read the trace result and assert non-retryable cancellation at `tests/server/infra/providers/roles/dispatch.test.ts:123-256` (R4).
- Current vLLM topology/template/argv changes are paired with exact direct assertions, including single-GPU rerank fallback, at `packages/server/src/infra/providers/vllm/engine/build-argv.ts:274-398` and `tests/server/infra/providers/vllm/engine/build-argv.test.ts:147-343` (R4).

## Declared versus completed

| Declared surface | Strongest evidence | Status |
| - | - | - |
| Eight-role `ProviderExecutor` | R3: bound at `packages/server/src/infra/providers/index.ts:30-40`; boot caller at `packages/server/src/entry/compose/services.ts:319`; R4 direct role tests | Wired and directly tested. |
| Source×role credential policy | R4: `packages/server/src/infra/providers/roles/firewall.ts:11-49`; `tests/server/infra/providers/roles/firewall.test.ts:25-128` | Implemented, fail-closed, unit-tested. |
| vLLM engine lifecycle and five role surfaces | R3: registry registration at `packages/server/src/infra/providers/index.ts:140-148`; R4 direct engine/surface tests | Wired and unit-tested; no R5 local engine proof in this lane. |
| `AgentDialogKind` future API | R2/R1: declared with a named future marker at `packages/server/src/infra/providers/contract/agent.ts:13-16`; AST sees it as unused | Explicitly dormant, not a completed runtime path. |

## Tests and gates

The exact owned-file direct command passed 39 test files / 432 tests with no type errors. It covered unit and one type-test file; no assigned integration, contract, CT, e2e, or live test file was present. The first directory command was broader than ownership (90 files / 1,074 passed / 6 skipped) and is excluded from verdict credit. `pnpm check:tests-execution-membership` passed, proving runner membership repository-wide but not vLLM behavior. No command failed; therefore no canonical failure report required freshness reconciliation.

## Cross-lane edges

- The only R3 boot edge is `packages/server/src/entry/compose/services.ts:319`, owned outside this lane. The entry/integration owner should establish startup-to-provider-to-request proof and any live vLLM receipt needed to close SPR-01.
- vLLM template files and deployment settings are outside ownership; their compatibility with `packages/server/src/infra/providers/vllm/engine/build-argv.ts:274-379` is not established here.
- The global audit manifest owner must reconcile the four current-file hash changes in SPR-02.

## Tool receipts

`pnpm ast` was read and used after the full-read barrier. `exports` identified 425 provider exports (wider discovery scope); `callers createProviderExecutor` found one composition call; `orphans` found one explicitly-future owned type; `apisurface` was retained as a wider candidate lens only. The literal `rg` cross-check corroborated the orphan candidate’s declaration/barrel-only references. No direct ast-grep absence assertion was used, hence there is no unsupported TS/TSX scan-count inference.

## Lane verdict

The provider dispatcher/firewall and vLLM configuration surfaces are implemented, wired into boot at R3, and directly unit/type-tested at R4.  
The current staged argv/GPU-budget changes have mirrored direct tests and passed.  
No owned source behavior defect was established.  
The largest owned-lane uncertainty is R5: no current real vLLM process, GPU topology, or HTTP request receipt proves the emitted local-engine configuration works in deployment; integration/probe lanes must determine whether that is a repository-wide gap.  
The assignment snapshot drifted for four owned files during the audit; this report instead applies to the current receipt and treats that drift as audit state, not a product defect.
