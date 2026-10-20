---
kind: work
status: doing
updated: 2026-10-20
priority: P1
lane: codex/legacy-engine-root-1193
plan: test-foundation
---

# Legacy chat engine suites take the engine from the composed graph

## What

Rebuild the legacy createTurnEngine(ctx, deps) sites on the composed root. Rows (file:line, case or helper, what it proves): solo-byte-identical.suite.int:83 realEngine, solo prompt is byte-identical to the pre-group baseline; engine/engine.int:168 harness (+131,132 removed generateSegments/generateDigests), turn lifecycle, warnings, memory build and recall wiring; engine.int:619 committed turn economics land in characterStats/ownerStats/dailyStats; engine.int:724 a memory-build throw is a warning, never a turn failure; engine.int:767 a failing warning emit is a passenger; engine.int:813 no summarize connection: segments build, digests skipped, no notice; engine.int:853,857 F3 builds get character names, not typeids; engine.int:885 F3b scoped digests honour witness horizons; engine.int:910 F3c per-speaker scoped recall; engine.int:948 F3d merged/narrator rounds keep round-level recall; engine.int:980 rerank-unavailable warns once per episode; engine/managed-compaction.suite.int:157 buildEngine plus 365,406,471,659,722,795,844: failing compaction never blocks; no-wall invariant; trim warning; fit estimate governs pct; single-flight; cancel propagates; failure is not cancellation; engine/round.int:76 realEngine, multi-speaker rounds; engine/engine-stats.suite.int:161 engineFor plus 390,462,531,610: gen-time bounds, reasoning duration rollup, provider provenance sidecar, continuation window; \_scenario.ts:250 buildChatScenario, the scripted scenario harness; engine/turn-fault-outcome.suite.int:97 engineOver, fault outcomes; engine/memory-optout.suite.int:113 groupHarness, group memory opt-out; engine/variant-params.suite.int:43 engineOf, per-variant params; engine/inline-reply-images.suite.int:136 harness, inline reply image round trip; verbs/turn.int:310 harness, turn verb integration; verbs/send-attach.suite.int:107 harness, the send attachment trust boundary. All paths under tests/legacy/server/domain/chat/.

## Why

createTurnEngine takes only the engine capability projection and bound memory ops; the projection is closure-private in createChatService and must not be exported for legacy. These cases do not typecheck, so the legacy program stays red until they move.

## Done when

Every listed behavior and required scenario consumer runs through the composed graph with its meaningful invariants preserved. Remove replaced legacy assemblies only after successor qualification.

## Evidence

Private spy expressions map to qualified provider requests, durable rows and production recorders. Fabricated narrator input and stale-return cases require explicit production-wiring controls and recorded corrections; they do not authorize a compatibility facade.

Warning-failure coverage exercises durable append failure through the total composed publisher, not an injected rejecting emitter. Preserve completed canon, failure reporting and background settlement. Impersonation coverage exercises a non-persisting draft followed by an explicit message commit. Compare live accounting with canonical reconciliation and prove that drafting alone changes neither canon nor rollups.

Standalone attachment, variant-parameter and memory-opt-out successors are integrated at `57a7367dd3`; their replaced legacy files are removed. Independent source review and completed controls: `reports/review/1193-leg1-review.md` and `reports/review/1193-first-leg-worktree-evidence/`.

Round and solo successors are delivered at `0da1fbed50`; their replaced legacy files are removed. Real cancellation, lease ownership, narrator identity and signed cue replay retain their qualified controls. Evidence: `reports/review/1193-leg2-review.md` and `reports/review/1193-second-leg-worktree-evidence/`. Lifecycle, statistics, memory-build, compaction, inline-image and scenario-consumer replacements remain; this item stays active.
