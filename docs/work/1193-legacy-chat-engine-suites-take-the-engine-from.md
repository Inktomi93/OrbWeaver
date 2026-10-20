---
kind: work
status: open
updated: 2026-10-20
priority: P1
plan: test-foundation
---

# Legacy chat engine suites take the engine from the composed graph

## What

Rebuild the legacy createTurnEngine(ctx, deps) sites on the composed root. Rows (file:line, case or helper, what it proves): solo-byte-identical.suite.int:83 realEngine, solo prompt is byte-identical to the pre-group baseline; engine/engine.int:168 harness (+131,132 removed generateSegments/generateDigests), turn lifecycle, warnings, memory build and recall wiring; engine.int:619 committed turn economics land in characterStats/ownerStats/dailyStats; engine.int:724 a memory-build throw is a warning, never a turn failure; engine.int:767 a failing warning emit is a passenger; engine.int:813 no summarize connection: segments build, digests skipped, no notice; engine.int:853,857 F3 builds get character names, not typeids; engine.int:885 F3b scoped digests honour witness horizons; engine.int:910 F3c per-speaker scoped recall; engine.int:948 F3d merged/narrator rounds keep round-level recall; engine.int:980 rerank-unavailable warns once per episode; engine/managed-compaction.suite.int:157 buildEngine plus 365,406,471,659,722,795,844: failing compaction never blocks; no-wall invariant; trim warning; fit estimate governs pct; single-flight; cancel propagates; failure is not cancellation; engine/round.int:76 realEngine, multi-speaker rounds; engine/engine-stats.suite.int:161 engineFor plus 390,462,531,610: gen-time bounds, reasoning duration rollup, provider provenance sidecar, continuation window; \_scenario.ts:250 buildChatScenario, the scripted scenario harness; engine/turn-fault-outcome.suite.int:97 engineOver, fault outcomes; engine/memory-optout.suite.int:113 groupHarness, group memory opt-out; engine/variant-params.suite.int:43 engineOf, per-variant params; engine/inline-reply-images.suite.int:136 harness, inline reply image round trip; verbs/turn.int:310 harness, turn verb integration; verbs/send-attach.suite.int:107 harness, the send attachment trust boundary. All paths under tests/legacy/server/domain/chat/.

## Why

createTurnEngine takes only the engine capability projection and bound memory ops; the projection is closure-private in createChatService and must not be exported for legacy. These cases do not typecheck, so the legacy program stays red until they move.

## Done when

Each listed case runs against an engine taken from the composed graph or its chat service with its assertion unchanged, and the listed sites leave tsconfig.tests-legacy.json.

## Evidence

Filled at landing: what ran and where its output is.
