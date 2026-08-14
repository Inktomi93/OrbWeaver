# Orbweaver repository audit — cold interim synthesis

Date: 2026-08-13 MDT  
Status: interim; fixed 27-lane read barrier, not a whole-repository verdict

## Executive verdict

The audited half of Orbweaver is not a wreck. It is heavily implemented, consistently layered, and backed by substantial current behavioral evidence. Across the fixed 27-lane denominator, the audit established **no P0 and no proven P1**. It established **one clear P2 product-behavior defect**: a custom OpenAI-compatible credential endpoint can be reported healthy without any endpoint probe. It also established two meaningful P2 enforcement weaknesses in the structural gate system: 278 existing sites are deliberately admitted by ratchets, and the canonical structure artifact does not report per-gate scan denominators.

That is the good news. The bad news is that the repository can look greener than its operational proof warrants. Most internal composition is R3, unit-only behavior is R4, and a large amount of database/integration/CT behavior is genuinely R5. But live vLLM/GPU behavior, downloaded local-light models, deployment networking, and several client-to-server feature seams still lack current live or consumer-intent proof. The 33-procedure `unwired` result is therefore a **triage queue, not 33 defects**.

The blunt conclusion: **core architecture and tenant-bound behavior are stronger than the audit noise; deployment proof and consumer-surface reconciliation are the weak spots.** Fix the one false health signal, improve gate observability, then resolve client intent before writing or deleting feature code.

## Coverage, cutoff, and snapshot authority

### Exact read denominator

The completion inventory was frozen after the corrected `client-chat-lib` artifacts were present (latest corrected artifact mtime 2026-08-13 23:41:17 MDT) and before `client-chat-runtime/report.md` appeared at 23:48:06 MDT. A lane counted only if its directory contained all four required artifacts: `assignment.txt`, `read-receipt.tsv`, `commands.md`, and `report.md`. Every one of those four artifacts was then read in full for every included lane, including every TSV receipt row.

**Completed-lane denominator read: 27 / 78 frozen manifest lanes.** The included lanes are:

- Client: `client-chat-components`, `client-chat-lib`.
- Lower packages: `lower-contracts`, `lower-db`, `lower-kit`.
- Gates and harness: `gates-a-h`, `gates-i-p`, `gates-q-z`, `verification-harness`.
- Server chat/entry/foundation/infra/providers: `server-chat-assembly`, `server-chat-core`, `server-chat-verbs`, `server-entry-boot`, `server-entry-compose`, `server-entry-edge`, `server-foundation`, `server-infra`, `server-providers-backends`, `server-providers-runtime`, `server-transport-kit`.
- Server domains: `server-content-domains`, `server-control-domains`, `server-discovery-automation`, `server-identity-domains`, `server-rpg`, `server-search-refinery`, `server-world-workloads`.

`client-chat-runtime` completed after the barrier and is deliberately excluded rather than partially sampled or forcing a restart. At the barrier, `client-chat-runtime`, `client-identity-features`, `client-preset-refinery`, `client-rpg-settings`, and `client-shell-features` were incomplete; another 46 frozen-manifest lanes had no complete four-artifact lane directory. Therefore **51 / 78 manifest lanes are not synthesized here**.

### Frozen c932 progress denominator

`MANIFEST-ALL.json` is used only as the corrected frozen partition/progress denominator at `c93253a3f907fb7fd93d411c511a98ed378505db`. Its 78 disjoint owned partitions contain 5,700 files, 936,529 lines, and 76,311,612 bytes, plus nine shared prerequisite files outside the owned-progress count. The 27 included partition IDs account for:

| Measure | Included | Frozen c932 total | Coverage |
| --- | ---: | ---: | ---: |
| Owned files | 3,203 | 5,700 | 56.19% |
| Text lines | 465,412 | 936,529 | 49.70% |
| Bytes | 24,007,539 | 76,311,612 | 31.46% |
| Lanes | 27 | 78 | 34.62% |

This is coverage of the frozen partition, not a claim that 56% of product risk is closed. Large binary/generated-heavy future lanes skew the byte ratio, while the completed set is source/test dense.

### Rolling snapshot range

Per-lane `assignment.txt` and `read-receipt.tsv` are the byte authority. Of the 27 included assignments, **25 begin at `e777c47e5860a105c114e061dcf98bcab1baa952` and two begin at c932** (`client-chat-components` and `client-chat-lib`). The rolling snapshot range is therefore **e777 → c932**. The assignment rows total 3,203 files, 465,399 lines, and 24,006,625 bytes. Current receipts add 13 lines and 914 bytes in two explicitly reconciled drift cases, producing the c932 progress figures above: one foundation file gained 21 bytes, and four provider-runtime files gained 13 lines / 893 bytes. The audit read the changed bytes; it did not silently pretend every conclusion came from one immutable tree. See the snapshot policy in [`SNAPSHOT-POLICY.md`, “Current rule” and “What happened”](SNAPSHOT-POLICY.md) and the two drift reports in [`server-foundation`](lanes/server-foundation/report.md#read-receipt) and [`server-providers-runtime`, “SPR-02”](lanes/server-providers-runtime/report.md#audit-state).

## Strongest proven findings, ranked

### P0 — none proven

No completed lane established data loss, auth bypass, tenant escape, or an unavailable core path at P0.

### P1 — none proven

Automation client reachability is a P1 **candidate**, not a proven P1. No completed lane supplied the missing client/product-intent evidence required to promote it.

### P2 — proven

1. **Custom endpoint health can return a false green result — product behavior, R5.** The non-OpenRouter branch returns `{ status: "ok" }` without invoking `ctx.probe` at [`packages/server/src/domain/credentials/verbs/test-health.ts:75`](../../../packages/server/src/domain/credentials/verbs/test-health.ts#L75). The current integration test explicitly proves `custom_openai` returns `ok` while the probe ledger remains empty at [`tests/server/domain/credentials/verbs/test-health.int.test.ts:92`](../../../tests/server/domain/credentials/verbs/test-health.int.test.ts#L92). Impact is bounded but real: the next model request can be the first actual reachability/authentication check. Client presentation remains outside the completed lanes. Source classification: [`server-identity-domains/report.md`, “SID-01”](lanes/server-identity-domains/report.md#sid-01--custom-endpoint-health-is-reported-as-successful-without-an-endpoint-check).

2. **Two active structure ratchets admit 278 known sites — enforcement debt, R5 gate behavior.** Density budgets admit 226 sites and finding-overload provenance budgets admit 52; the gates report only growth beyond those checked-in budgets. The mechanics are at [`scripts/check/gates/density-tier.ts:19`](../../../scripts/check/gates/density-tier.ts#L19), [`density-tier.ts:363`](../../../scripts/check/gates/density-tier.ts#L363), and [`finding-overload-provenance.ts:297`](../../../scripts/check/gates/finding-overload-provenance.ts#L297). This is controlled debt, not a silent broken gate, but it means a green structure run does not mean the existing population is clean. Source classification: [`gates-a-h/report.md`, “GA-H-01”](lanes/gates-a-h/report.md#ga-h-01--two-active-ratchets-deliberately-green-light-278-pre-existing-sites).

3. **The canonical structure artifact lacks per-gate scan denominators — instrument defect.** The current report records overall status/findings but not each gate's candidate, scanned, or skipped population. Predicate-sensitive gates demonstrate why that matters at [`baseui-derives-not-respells.ts:279`](../../../scripts/check/gates/baseui-derives-not-respells.ts#L279), [`freeze-provenance-write-pairing.ts:550`](../../../scripts/check/gates/freeze-provenance-write-pairing.ts#L550), and [`gate-ignore-inventory.ts:96`](../../../scripts/check/gates/gate-ignore-inventory.ts#L96). A future scope regression can remain green. This finding recurs across gate lanes and is counted once; see [`gates-a-h/report.md`, “GA-H-02”](lanes/gates-a-h/report.md#ga-h-02--a-clean-structural-run-has-no-per-gate-scan-denominator-receipt).

### P3 — proven, lower urgency

1. **Wire-capture law contradicts runtime retention.** The function contract says captures are never persisted at [`wire-capture.ts:100`](../../../packages/server/src/foundation/observability/debug/wire-capture.ts#L100), but it invokes the spill path at [`wire-capture.ts:106`](../../../packages/server/src/foundation/observability/debug/wire-capture.ts#L106), configures the directory/ceiling at [`wire-capture.ts:220`](../../../packages/server/src/foundation/observability/debug/wire-capture.ts#L220), and appends JSONL at [`wire-capture.ts:250`](../../../packages/server/src/foundation/observability/debug/wire-capture.ts#L250). The file header is accurate; the function law is stale. This is documentation/retention legibility debt, not proof that disk spill itself is unintended. See [`server-foundation/report.md`, “SF-01”](lanes/server-foundation/report.md#sf-01--wire-capture-sink-contract-falsely-says-captures-are-never-persisted).

2. **`bounded-list-limit` is explicitly name/syntax limited.** It ignores properties not named exactly `limit` and identifier-backed schemas at [`bounded-list-limit.ts:61`](../../../scripts/check/gates/bounded-list-limit.ts#L61) and preserves `topN`/named-schema bypasses in its own passing controls at [`bounded-list-limit.ts:110`](../../../scripts/check/gates/bounded-list-limit.ts#L110). This is a known narrow gate, not evidence of a current unbounded endpoint. See [`gates-a-h/report.md`, “GA-H-03”](lanes/gates-a-h/report.md#ga-h-03--bounded-list-limit-deliberately-misses-semantically-equivalent-non-limit-and-named-schema-inputs).

3. **One Q–Z gate path lacks an independent local positive control.** The RPG bus stale/deferred arm is covered by broader enforcement but lacks a gate-local fixture that proves this exact branch fires. This is test-quality debt, not a demonstrated product bug; see [`gates-q-z/report.md`, “GQZ-01”](lanes/gates-q-z/report.md#gqz-01).

4. **Imagery compatibility re-exports are test-consumed, not runtime-consumed.** `PROMPT_TEMPLATES` and `CAPTION_INSTRUCTIONS` are described as compatibility re-exports but currently reach tests rather than a live runtime consumer. That is architecture/law drift, not missing product behavior; see [`server-content-domains/report.md`, “SCD-01”](lanes/server-content-domains/report.md#scd-01).

## Candidate queue awaiting later lanes

These are deliberately not promoted into defects.

| Priority | Candidate | What is actually proved | Required closing evidence |
| --- | --- | --- | --- |
| P1 candidate | Ten automation procedures have no detected client consumer | The automation service is composed and its 10 procedures are mounted; the typed consumer lens finds no client use. [`server-discovery-automation/report.md`, “SDA-01”](lanes/server-discovery-automation/report.md#findings) | Completed client-shell/automation lanes plus product intent. If browser UI is intended, wire it; otherwise mark/remove the dormant surface. |
| P2 candidate | 33 tRPC procedures in 11 router files need reachability reconciliation | The resolver-aware lens enumerated 369 procedures and returned 33 provider-minus-client candidates. [`server-transport-kit/report.md`, “STK-01”](lanes/server-transport-kit/report.md#stk-01--p2-candidate-33-declared-trpc-procedures-need-client-lane-reachability-reconciliation) | Direct client-lane consumer and intent review. Do not bulk-wire or bulk-delete from the lens alone. |
| Closed as intentional dormancy unless intent changes | Seven plugin procedures are mounted with no client consumer | The server source explicitly states the routes are intentionally mounted for future client integration at [`packages/server/src/domain/plugin/index.ts:6`](../../../packages/server/src/domain/plugin/index.ts#L6), and current transport integration proves plugin lifecycle. [`server-control-domains/report.md`, “Cross-lane edges”](lanes/server-control-domains/report.md#cross-lane-edges) | No defect work now. Reopen only when product intent changes. |
| P2 candidate | `regex.getScript` has no typed client consumer | It is registered, owner-safe, and current integration-tested; an independent literal check found zero use across 2,787 client/test TS/TSX files. [`server-search-refinery/report.md`, “SERVER-SEARCH-REFINERY-01”](lanes/server-search-refinery/report.md#server-search-refinery-01--p2-candidate-regexgetscript-has-no-client-consumer) | Confirm whether a detail-fetch UI is intended. The independent negative method strengthens the reachability fact, not the product-defect inference. |
| Cross-lane candidates | Five content procedures (`databank.attachToCharacter`, `databank.detachFromCharacter`, `imagery.editImage`, `imagery.extractPrompt`, `imagery.readProvenance`) | They appear in the same 369-procedure structural diff and are implemented server-side. [`server-content-domains/report.md`, “Cross-lane edges”](lanes/server-content-domains/report.md#cross-lane-edges) | Client/content intent and consumer review. |
| P2 candidate / proof gap | Local vLLM has no current process/GPU/HTTP model-turn receipt | Registry and boot wiring are R3; exact owned unit/type tests passed 432/432 at R4. No completed lane started vLLM. [`server-providers-runtime/report.md`, “SPR-01”](lanes/server-providers-runtime/report.md#spr-01--p2-candidate-local-vllm-behavior-has-no-owned-integration-ct-or-live-runtime-receipt) | Approved GPU-backed live probe covering emitted flags, health/recovery, and one role request. |
| P3 proof gap | Three local-light role suites skipped six real-model tests | The offline run passed 642 tests and intentionally skipped downloaded-model embed/image-embed/rerank checks. [`server-providers-backends/report.md`, “SAPB-01”](lanes/server-providers-backends/report.md#sapb-01--three-real-model-role-checks-have-no-current-execution-receipt) | Disposable networked run with `ORB_LOCAL_LIGHT_E2E=1`; do not burden normal CI with multi-GB downloads. |
| Candidate coverage debt | 26 of 76 chat-component source leaves lack a same-basename CT; four of 28 DB schema leaves lack a same-basename DB integration test | These are allocation/mirror facts, not absence of transitive behavior. [`client-chat-components/report.md`, “Finding”](lanes/client-chat-components/report.md#finding) and [`lower-db/report.md`, “LOWER-DB-01”](lanes/lower-db/report.md#lower-db-01) | Parent-feature tracing and risk review before creating tests. |
| Candidate domain debt | Fifteen persisted columns are write-only in the bounded AST lens | The scan covered 748 columns / 85 tables; product intent and read paths remain unproved. [`lower-db/report.md`, “LOWER-DB-02”](lanes/lower-db/report.md#lower-db-02) | Domain-owner review; distinguish intentional audit/cache fields from stale schema. |
| Candidate liveness debt | 27 orphan-export candidates in 15 contract files; five star-export cases suppressed | Positive discovery only; “candidate” is not “dead.” [`lower-contracts/report.md`, “LC-01”](lanes/lower-contracts/report.md#lc-01) | Resolve re-export/dynamic/public API consumers before removal. |
| Runtime proof gap | Card-frame CSP builder has unit proof but no browser/runtime receipt | Pure construction is R4; enforcement in an actual browser boundary is unproved. [`lower-kit/report.md`, “LOWER-KIT-01”](lanes/lower-kit/report.md#lower-kit-01) | One owning browser/CT integration, if the deployed CSP path is important enough to protect. |

The categories above reconcile 23 of the 33 tRPC candidates explicitly: 10 automation, seven intentionally dormant plugin routes, one regex route, and five content routes. The remaining 10 stay in the transport/client reconciliation queue; this synthesis does not invent intent or classifications absent completed owner lanes.

## Architectural assessment

### Interim five-axis scorecard

These scores apply only to the 27 completed lanes and are not an average of lane tables.

| Axis | Score | Cold judgment |
| --- | ---: | --- |
| Implementation | 4/5 | Most audited surfaces contain real service, persistence, lifecycle, failure, and ownership logic rather than declarations. Representative concrete roots include [`createProviderExecutor`](../../../packages/server/src/infra/providers/index.ts#L30), RPG flush refusal before durable write at [`flush.ts:270`](../../../packages/server/src/domain/rpg/chat-ops/flush.ts#L270), and workload status-guarded terminal writes at [`runner.ts:62`](../../../packages/server/src/domain/workloads/engine/runner.ts#L62). |
| Wiring | 3/5 | Entry composition and transport registration are broadly R3, including provider boot at [`services.ts:319`](../../../packages/server/src/entry/compose/services.ts#L319) and router composition at [`router.ts:42`](../../../packages/server/src/transport/trpc/router.ts#L42). The score stops at 3 because client consumption is unresolved for 33 procedures and five client feature lanes were incomplete at cutoff. |
| Verification | 4/5 | Current unit, integration, CT, contract, parity, and focused harness evidence is substantial. Integration/CT/e2e/live executions are R5; unit-only executions are R4. The score is not 5 because live external/provider/GPU paths and incomplete client areas remain unproved. |
| Enforcement | 3/5 | The descriptor-driven gate and verification harnesses are real and fail-closed, with required `mustFlag`/`mustPass` proofs at [`loader.ts:13`](../../../scripts/check/loader.ts#L13). Nonzero ratchets and missing per-gate denominators prevent a stronger portfolio score. |
| Operability | 3/5 | Verification emits classified artifacts and strict defer/skip behavior, transport has tenant/rate-limit integration evidence, and foundation has current DB-backed observability tests. False custom health, stale wire-retention law, and absent live local-model proof keep this at 3. |

### What the architecture gets right

- **Boundaries are mostly honest.** Contracts, thin service composition, verbs, persistence, entry composition, and tRPC transport are recognizable and repeatedly proven as live R2/R3 paths. The pattern is repeated without forcing every domain into a speculative framework.
- **Tenant and authority checks are not decorative.** Current R5 integration evidence covers owner-scoped credential resolution, foreign-row non-disclosure, cross-tenant transport denial with a positive owner control, regex foreign/absent non-oracle behavior, and RPG authority paths. Representative receipts are [`credentials/resolve.ts:24`](../../../packages/server/src/domain/credentials/verbs/resolve.ts#L24), [`character/queries.ts:83`](../../../packages/server/src/domain/character/persistence/queries.ts#L83), and [`cross-tenant-sweep.suite.int.test.ts:1`](../../../tests/server/transport/cross-tenant-sweep.suite.int.test.ts#L1).
- **Critical lifecycle code has real behavior around it.** RPG flush/cancellation, durable chat buses, workload races, plugin install/disable/uninstall, SSRF redirect/DNS checks, archive rejection, and real-DB domain paths have current integration receipts. These are stronger than typecheck theater.
- **Dormancy is sometimes explicit rather than accidental.** Plugin routes and `AgentDialogKind` are named as future surfaces. That is acceptable YAGNI posture if the declarations are cheap and the intent remains visible; it should not be misreported as broken wiring.

### What remains structurally weak

- The server exposes a large procedure surface relative to completed client proof. The `unwired` lens is useful, but the real architectural issue is ownership of intent: no single current artifact says which server capabilities are public product commitments, internal/automation seams, or deliberately parked.
- External-model configuration is extensively unit-tested but not currently deployment-proved. This is exactly where flag/template/version drift hurts, so a small sanctioned live probe is more valuable than more snapshots.
- Gate output emphasizes violations, not scan health. With 200 active gates and heterogeneous predicates, per-gate denominators are not reporting fluff; they are how a clean run avoids becoming a zero-scan placebo.

## Verification and gate assessment

### Behavioral evidence

After excluding repeated reruns, escaped directory runs, accidental whole-suite runs, type-only membership counts, and known subset reruns, the completed command logs establish a **conservative lower bound of 10,179 passing behavioral test cases/assertions**. This is not claimed as an exact unique assertion count: Vitest/Playwright reports use different counting language, and some suites exercise multiple assertions per test.

| Disjoint owned-test group | Credited lower bound | Receipt basis |
| --- | ---: | --- |
| Client chat components/lib | 719 | 464 CT plus 234 unit plus 21 sanctioned CT; [`client-chat-components/commands.md`](lanes/client-chat-components/commands.md), [`client-chat-lib/commands.md:9,14`](lanes/client-chat-lib/commands.md#L9) |
| Gate positive controls | 5 | Shared fixture/conformance executions counted once, not once per gate lane; [`gates-a-h/commands.md:12-13`](lanes/gates-a-h/commands.md#L12) |
| Lower contracts/DB/kit | 1,824 | 807 + 274 + 743; [`lower-contracts/commands.md`](lanes/lower-contracts/commands.md), [`lower-db/commands.md`](lanes/lower-db/commands.md), [`lower-kit/commands.md`](lanes/lower-kit/commands.md) |
| Server chat assembly/core/verbs | 1,769 | 748 + 481 + 540 across disjoint assigned test files; [`server-chat-assembly/commands.md`](lanes/server-chat-assembly/commands.md), [`server-chat-core/commands.md`](lanes/server-chat-core/commands.md), [`server-chat-verbs/commands.md`](lanes/server-chat-verbs/commands.md) |
| Completed server domain lanes | 3,386 | Content 472, control 652, discovery/automation 362, identity 595, RPG 592, search/refinery 385, world/workloads 328; corresponding lane `commands.md` artifacts |
| Entry/foundation/infra/providers/transport | 2,430 | Boot 55, compose 172, edge 378, foundation 142, infra 435, provider backends 642, provider runtime 432, transport 174; corresponding lane `commands.md` artifacts |
| Verification harness | 46 | Focused configured registry/runner integration; [`verification-harness/commands.md`](lanes/verification-harness/commands.md) |

The accidental Q–Z `pnpm test` invocation collected 3,290 suites / 11,340 tests and is excluded from the lower bound. Its four vLLM argv failures were outside the gate lane and were superseded by the provider-runtime lane's current exact-owned 432/432 pass after the argv/test drift was reread. Similarly, the provider-runtime 90-file / 1,074-test escaped directory run and server-infra's malformed broad command receive no lane credit.

### Gates and harness

- All three gate partitions reported current registration/structure success across the 200-gate surface. The descriptor contract requires scope safety plus positive and negative controls; the fixture/conformance layer exercised current behavior at R5. This is strong evidence that the framework is live, not proof that every semantic blind spot is impossible.
- Test type membership is current green over 1,858 files; execution membership is current green over 1,689 runner-suffixed files across three runner views. Membership proves registration, not behavior.
- The verification registry/runner itself reached R5 through the focused 46-test integration run. It classifies nonzero/tool errors, stores logs, and makes strict deferred work fail rather than silently pass at [`scripts/verify/run.ts:528`](../../../scripts/verify/run.ts#L528).
- The gate posture is materially weakened by the 278 admitted baseline sites and lack of per-gate scan counts. Those are the enforcement priorities; generating more gate descriptors is not.

## Audit-method limitations and coordinator corrections

1. **Rolling tree, not one immutable snapshot.** The audit began at e777; the frozen partition denominator is c932; assignments/receipts are authoritative for each lane. Foundation and provider-runtime drift was reread and disclosed. `MANIFEST-ALL.json` must not be used to overwrite that history.
2. **Clean native AST output is not universal absence proof.** Lanes with clean `orphans`, `testonly`, `prodonly`, or `unwired` output but no independent negative method are reported as bounded tool results only. Regex is the exception with an independent 2,787-file TS/TSX literal check; even there, missing product intent prevents defect promotion. This follows [`README.md`, “Required lane outputs”](README.md#required-lane-outputs) and [`RUBRIC.md`, “Evidence discipline”](RUBRIC.md#evidence-discipline).
3. **Same-basename tests are not the product contract.** Chat-component and DB mirror counts are allocation signals. They do not prove behavior is absent or justify boilerplate test creation.
4. **Unwired is not broken without intent.** The 33-procedure result is a provider-minus-client structural diff. Explicit plugin dormancy, non-browser automation possibilities, dynamic consumers, and future/client-incomplete lanes are real alternative explanations.
5. **`client-chat-lib` was corrected.** A raw Playwright invocation failure was a command-shape error, not an instrument defect. The sanctioned `pnpm test:ct tests/client/features/chat/lib` run passed 21/21 and produced a fresh CT report; the superseded `CLIENT-CHAT-LIB-01` claim is not present here. See [`client-chat-lib/commands.md:14`](lanes/client-chat-lib/commands.md#L14) and its current [`report.md`, “Findings”](lanes/client-chat-lib/report.md#findings).
6. **Verification membership was corrected.** The historical restricted-sandbox exit 2 came from nested runner spawns. Two exact unsandboxed reproductions passed, and the canonical artifacts agree. It is environmental evidence, not a repository P1; see [`verification-harness/report.md`, “Findings”](lanes/verification-harness/report.md#findings).
7. **Broad and repeated runs were not laundering.** Accidental whole-suite/escaped-scope results are recorded but excluded from lane credit. Closing reruns and same-file focused reproductions were not double-counted.
8. **The cutoff is real.** `client-chat-runtime` later completed and passed its scoped CT, but it was incomplete at the barrier. This synthesis does not use its report, receipt, or result.

## Blunt next priorities

1. **Fix the custom endpoint health semantic first.** Either probe the endpoint through the existing redacted boundary or return an explicit `unchecked`/`unsupported` state. Returning `ok` without a check is bullshit and will mislead someone.
2. **Make structure reports expose per-gate scan health and outstanding ratchet debt.** Candidate/scanned/skipped counts plus the 226/52 budgets belong in normal output. Do this before adding more gates.
3. **Reconcile the 33 tRPC candidates with owner intent, starting with automation.** Close plugin as intentional dormancy, decide `regex.getScript`, then classify the content/remaining routes. Do not shotgun-wire dead UI and do not delete server capability from one AST lens.
4. **Run one sanctioned live local-model proof.** Current unit snapshots are good but insufficient. Prove current vLLM flags/templates/GPU placement and one request; separately run the three opt-in local-light role suites in a disposable networked environment.
5. **Finish the client lanes and then judge end-to-end reachability.** Client shell, identity, preset/refinery, RPG/settings, and the post-cutoff chat-runtime lane are the missing half of many “unwired” questions. A whole-repo product verdict before those lanes is premature.
6. **Correct the wire-capture contract now.** It is a tiny documentation fix with retention implications. Add a filesystem test only if disk spill itself is an intended regression boundary; do not manufacture one just for coverage.
7. **Re-freeze only at the final synthesis barrier.** Keep lane receipts as history, finish remaining lanes, then produce one final current-tree manifest/progress reconciliation. Rewriting old assignments would destroy the audit trail.

## Bottom line

At the 27-lane cutoff, Orbweaver's audited core is broadly implemented, layered, and behaviorally serious. Tenant isolation, persistence, transport, lifecycle, and gate machinery have real integration evidence. The audit did **not** uncover a catastrophic architecture failure. It uncovered one honest P2 product lie, two important gate-observability/enforcement weaknesses, a handful of P3 law/test gaps, and a large but mostly unclassified cross-lane reachability queue. The next move is targeted verification and intent reconciliation—not a refactor spree.
