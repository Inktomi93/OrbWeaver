---
kind: bug
status: doing
updated: 2026-10-17
priority: P1
lane: codex/router-declaration-bridge-965
plan: test-foundation
---

# Static checks and pnpm ast run within a standard CI runner's memory

## What

Prioritize structural cuts: D320 legacy analysis eligibility, unnecessary typed-gate removal and AppRouter type-bridge closure isolation. Separate compiler baseline cost from additional analysis work, with runtime and checker concurrency explicit.

Keep TS6 analysis and park TS7 benchmarks and adapter work. Follow the [native occurrence-index design](../plans/native-occurrence-index/design.md) for persisted reference lookup without repeated bulk program searches. Shared facts preserve world-specific bindings, dependency invalidation and existing consumer judgments. Attribute invocation work separately.

## Why

Public checks must fit hosted runners and contributor machines, not only a large workstation.

## Done when

pnpm check, the structure stage and every pnpm ast verb complete within the hosted runner's memory with their peak recorded; concurrent pnpm ast verbs share the one store.

## Evidence

The supported `pnpm ast apisurface --in /src/ --public --json --max 1000000` completes on managed Node 26.10.0 with complete output. Elapsed 2:37.88; maximum RSS 15,719,224 KiB; no swaps. This measures that verb, not hosted qualification of every tool.

Bounded native UI projection completes with worker release: elapsed 1:58.62, maximum RSS 2,501,396 KiB, no swaps. This is not aggregate concurrent memory or a full apisurface measurement.

The composite diagnostic reaches API-surface entry and exhausts V8 heap. No complete verdict exists. This locates the custom sequence's abort, not its allocation cause or a shipped-command defect.

Complete tests-DOM cold publication passes at frozen `7394d01aaf` in 73:47.834. Sampled parent-plus-worker RSS peaks at 10.977 GiB, without sampled swap; this is not a continuous physical-memory peak. Inputs revalidate and owned processes exit. Evidence: `.claude/worktrees/codex-tests-dom-profile-1002/reports/review/1002-tests-dom-postfix-qualification.md`. Multi-world equivalence, concurrent reuse and hosted measurements remain open.

Portable corpus contracts remove the Node/server closure while preserving exhaustive router conformance. Declaration bridges still require freshness and closure qualification. Evidence: `reports/review/1040-portable-corpus-ordinary.md`.

The profiled TS7 prototype is slower, larger and fails reference parity. Further TS7 benchmarks and adapters remain parked. Evidence: `reports/review/1002-ts7-checker-benchmark.md`.

Bulk reference extraction calls the patched native reference pass per declaration only when that family is demanded. The pass caches candidates and results. The abandoned owner-policy worker did not demand that family; it supplies no bulk-reference cost attribution. Item 1045 owns occurrence delivery and matched measurement. Preserve native types and attribute invocation cost separately.
