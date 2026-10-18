---
kind: bug
status: open
updated: 2026-10-18
priority: P1
plan: test-foundation
---

# Static checks and pnpm ast run within a standard CI runner's memory

## What

Prioritize structural cuts: D320 legacy analysis eligibility, unnecessary typed-gate removal and AppRouter type-bridge closure isolation. Separate compiler baseline cost from additional analysis work, with runtime and checker concurrency explicit.

Keep TS6 analysis and park TS7 benchmarks and adapter work. Follow the [native occurrence-index design](../plans/native-occurrence-index/design.md) for persisted reference lookup without repeated bulk program searches. Shared facts preserve world-specific bindings, dependency invalidation and existing consumer judgments. Attribute invocation work separately.

## Why

Public checks must fit hosted runners and contributor machines.

## Done when

pnpm check, the structure stage and every pnpm ast verb complete within the hosted runner's memory with their peak recorded; concurrent pnpm ast verbs share the one store.

## Evidence

The supported `pnpm ast apisurface --in /src/ --public --json --max 1000000` completes on managed Node 26.10.0 with complete output. Elapsed 2:37.88; maximum RSS 15,719,224 KiB; no swaps. This measures that verb, not hosted qualification of every tool.

Bounded native UI projection completes with worker release: elapsed 1:58.62, maximum RSS 2,501,396 KiB, no swaps. This is not aggregate concurrent memory or a full apisurface measurement.

The composite diagnostic exhausts V8 heap at API-surface entry; cause unqualified.

Complete tests-DOM cold publication passes at frozen `7394d01aaf` in 73:47.834. Sampled parent-plus-worker RSS peaks at 10.977 GiB, without sampled swap; this is not a continuous physical-memory peak. Inputs revalidate and owned processes exit. Evidence: `.claude/worktrees/codex-tests-dom-profile-1002/reports/review/1002-tests-dom-postfix-qualification.md`. Multi-world equivalence, concurrent reuse and hosted measurements remain open.

Portable corpus contracts remove the Node/server closure while preserving exhaustive router conformance. Declaration bridges still require freshness and closure qualification. Evidence: `reports/review/1040-portable-corpus-ordinary.md`.

Immutable router publication, observed emission and the output-watch correction are integrated. The client product typecheck consumes a fresh observed declaration view with native roots, options and references preserved. Currentness, cleanup and application controls pass review; the maintained full-client command passes. Source-based application eligibility stays distinct from projected child closure. Evidence: `reports/review/965-consumed-client-typecheck.md`. Complete router conformance and controlled closure evidence remain valid. Other compiler, lint, editor, semantic and transaction owners, origin qualification and warm reuse remain open.

The profiled TS7 prototype is slower, larger and fails reference parity. Further TS7 benchmarks and adapters remain parked. Evidence: `reports/review/1002-ts7-checker-benchmark.md`.

The complete-DOM CPU sample is dominated by bulk native reference search; candidate indexing still invokes per-query native semantics. No invocation demand was selected. The running measurement is profiled, not a completed cost verdict. Keep this separate from callable repair. Evidence: `reports/review/1002-current-dom-reference-profile.md`.

Maintained tests-DOM projection is declined: real CT support retains the server graph, so declarations add files without isolating it. Native checks and router conformance pass; this does not justify adopting the projection. Evidence: `reports/review/965-dom-router-qualification.md`.

AST routing declares per-verb store demand. Only `typeonly-alive` omits unused families; complete references and roots remain. CLI, factory and lifecycle controls pass review. Tooling types pass; inherited Node errors and world cost stay open. Evidence: `reports/review/965-ast-demand-routing.md`.
