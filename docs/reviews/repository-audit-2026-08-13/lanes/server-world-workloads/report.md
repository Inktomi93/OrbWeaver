# Server world / workloads lane report

## Lane identity

- Lane: `server-world-workloads`
- Semantic scope: server tag, tool-use, workload scheduler/engine, world-info source and mirrored tests.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`
- Working-tree basis: current bytes; every owned hash matches the snapshot.
- Assigned files read: 213 / 213 (100%).
- Assigned lines read: 14,453 / 14,453 (100%).
- Assigned bytes read: 673,260 / 673,260 (100%).
- Dirty assigned paths: 0.
- Exclusions: only the 213 `OWNED` paths in `assignment.txt`; entry/transport/client consumers are handoffs.

## Read receipt

`read-receipt.tsv` covers all 213 assigned paths, including empty tracked placeholders. The exact full-read replay command, timestamps, and post-read reconciliation are recorded in `commands.md` under “Read-barrier ordering correction”: current line count, byte count, and SHA-256 match every manifest row. The original AST work preceded that replay and is superseded; the retained tag AST receipts are fresh reruns performed after the complete read barrier.

## Architecture observed

Each domain has a thin local composition root. Tag assembles its verb factories without a cross-feature import (`packages/server/src/domain/tag/service.ts:21`); tool-use owns one service-lifetime tool registry and projects both tool interfaces through the shared executor (`packages/server/src/domain/tool-use/service.ts:57`); workloads assembles the verb façade separately from worker-facing engine entry points (`packages/server/src/domain/workloads/service.ts:87`); world-info wires owner-scoped books/entries and membership-scoped chat attachments through injected guards and event sinks (`packages/server/src/domain/world-info/service.ts:153`).

Workload dispatch makes terminal writes status-guarded and pairs live progress with a durable heartbeat snapshot (`packages/server/src/domain/workloads/engine/runner.ts:1`, `packages/server/src/domain/workloads/engine/runner.ts:62`). Tool-use converts malformed input, authorization denial, handler throws, and domain result failures to per-call data rather than aborting the batch (`packages/server/src/domain/tool-use/verbs/execute-tool-calls.ts:37`). World-info's bulk upsert preserves a human edit when its stored provenance hash no longer matches content (`packages/server/src/domain/world-info/verbs/entries/upsert-entries.ts:310`).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | - | - |
| tag | 4 | 3 | 4 | 3 | 3 | high | `packages/server/src/domain/tag/service.ts:21`; 18 focused integration files passed (R5) |
| tool-use | 4 | 3 | 4 | 3 | 3 | high | `packages/server/src/domain/tool-use/service.ts:57`; `packages/server/src/domain/tool-use/verbs/execute-tool-calls.ts:37`; 6 focused unit files passed (R4) |
| workloads | 4 | 3 | 4 | 3 | 3 | high | `packages/server/src/domain/workloads/service.ts:87`; `packages/server/src/domain/workloads/engine/runner.ts:62`; focused integration/unit files passed (R5/R4) |
| world-info | 4 | 3 | 4 | 3 | 3 | high | `packages/server/src/domain/world-info/service.ts:153`; `packages/server/src/domain/world-info/verbs/entries/upsert-entries.ts:366`; 35 focused integration files passed (R5) |

## Findings

No lane defect met the rubric's evidence threshold. The focused behavioral run covers 81 test files and 328 assertions; the executed integration portion is R5 evidence and the unit-only portion R4, neither of which proves end-to-end transport reachability.

## Proven strengths

### server-world-workloads-01 — focused behavioral coverage is current

- Class: proven-strength
- Confidence: high
- Evidence rung: R5 for the current integration run; R4 for unit-only paths
- Scope denominator: 81 focused test files, 328 assertions.
- Receipts: `tests/server/domain/workloads/engine/runner.int.test.ts:1`; `tests/server/domain/world-info/verbs/entries/wi-entry-fanout.suite.int.test.ts:1`; `tests/server/domain/tool-use/verbs/execute-tool-calls.test.ts:1`; current Vitest commands in `commands.md`.
- Established fact: 73 integration files / 301 assertions and 8 unit files / 27 assertions passed against real mirrored source.
- What remains unverified: production transport registration and live worker deployment.

### server-world-workloads-02 — native tag liveness lenses returned no candidates

- Class: proven-strength
- Confidence: high
- Evidence rung: R3 structural tool output; current tag integration behavior is separately R5
- Scope denominator: `packages/server/src/domain/tag` resolution-based export and entry closure surface.
- Receipts: `packages/server/src/domain/tag/service.ts:21`; the post-read `pnpm ast orphans/testonly/prodonly packages/server/src/domain/tag` reruns in `commands.md`.
- Established fact: the three post-read repository AST commands returned no tag candidates in their requested scopes.
- What remains unverified: an independent literal-method negative check for tag, and equivalent direct liveness reruns for the other three domains. The clean native-lens outputs are not promoted into a universal absence claim.

## Declared versus completed

The four `create*Service` roots are declarations wired to their local verb factories (R3 by full read). Tag behavior reached R5 through the current integration run; its clean native-lens outputs remain bounded tool results. The workload engine's runner path and the world-info import/upsert paths reached R5 through their current mirrored integration tests. Tool-use's executor and plugin registrar reached R4 through unit tests. No declaration is reported as unwired because router/entry composition is explicitly outside this lane.

## Tests and gates

Focused behavioral runs were green: integration 73 files / 301 tests in 24.031s and unit 8 files / 27 tests in 2.534s. They include failure-path assertions for tool parse/capability handling, workload lifecycle/race handling, and world-info persistence/import behavior. The execution-membership gate establishes runner coverage workspace-wide; the orphan ratchet establishes its current zero-orphan condition. Static reports were inspected but not credited as behavioral proof.

## Cross-lane edges

- The local composition roots establish only R3 wiring. The transport router and entry/worker composition owners must prove live HTTP and worker reachability.
- Tool-use's `toAgentToolServer` projection is injected at the entry boundary (`packages/server/src/domain/tool-use/service.ts:66`); its agent-SDK runtime integration belongs to that composition/infra owner.

## Tool receipts

See `commands.md` for exact commands, durations, scoped denominators, stale artifact treatment, and the AST instrument bounds. The tag-lens conclusions use the post-read reruns that supersede the original pre-read outputs. No direct `ast-grep` fallback was necessary.

## Lane verdict

The assigned domains are locally implemented and exercised by 328 current focused assertions. Native tag liveness lenses returned no candidates, but that clean result remains bounded because no independent negative method was recorded. The corrective sequence now satisfies the required order: complete assigned-file read, then fresh retained AST runs, then hash reconciliation; the earlier pre-read AST outputs are superseded. Cross-lane transport/runtime-worker composition remains unverified, and this report does not inflate local composition roots into end-to-end proof.
