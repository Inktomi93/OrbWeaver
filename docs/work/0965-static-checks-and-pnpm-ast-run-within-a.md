---
kind: bug
status: open
updated: 2026-10-18
priority: P1
plan: test-foundation
---

# Static checks and pnpm ast run within a standard CI runner's memory

## What

D328 bounds supported analysis; general callable closure is not acceptance. Prioritize D320 eligibility, native tools and declaration bridges. Measure supported commands, explicit unresolved outcomes and reuse separately from compiler baseline cost.

Keep TS6 analysis and park TS7 benchmarks and adapter work. Follow the [native occurrence-index design](../plans/native-occurrence-index/design.md) for persisted reference lookup without repeated bulk program searches. Shared facts preserve world-specific bindings, dependency invalidation and existing consumer judgments. Attribute invocation work separately.

## Why

Public checks must fit hosted runners and contributor machines. The standard hosted Linux runner has 16 GB of memory, which is the budget for every measured peak.

## Done when

pnpm check, the structure stage and every pnpm ast verb complete within the hosted runner's memory with their peak recorded; concurrent pnpm ast verbs share the one store.

## Evidence

The supported `pnpm ast apisurface --in /src/ --public --json --max 1000000` completes on managed Node 26.10.0 with complete output. Elapsed 2:37.88; maximum RSS 15,719,224 KiB; no swaps. This measures that verb, not hosted qualification of every tool.

Bounded native UI projection completes with worker release: elapsed 1:58.62, maximum RSS 2,501,396 KiB, no swaps. This is not aggregate concurrent memory or a full apisurface measurement.

Tests-DOM publication at `7394d01aaf` revalidates inputs and releases workers. Sampled RSS is not a continuous peak. Evidence: `.claude/worktrees/codex-tests-dom-profile-1002/reports/review/1002-tests-dom-postfix-qualification.md`. Multi-world equivalence, concurrent reuse and hosted measurements remain open.

Portable corpus contracts remove the Node/server closure while preserving exhaustive router conformance. Declaration bridges still require freshness and closure qualification. Evidence: `reports/review/1040-portable-corpus-ordinary.md`.

Immutable router publication, observed emission and the output-watch correction are integrated. The client product typecheck consumes a fresh observed declaration view with native roots, options and references preserved. Currentness, cleanup and application controls pass review; the maintained full-client command passes. Source-based application eligibility stays distinct from projected child closure. Evidence: `reports/review/965-consumed-client-typecheck.md`. Complete router conformance and controlled closure evidence remain valid. Other compiler, lint, editor, semantic and transaction owners, origin qualification and warm reuse remain open.

The profiled TS7 prototype is slower, larger and fails reference parity. TS7 work remains parked. Evidence: `reports/review/1002-ts7-checker-benchmark.md`.

Reviewed indexing and name links qualify complete DOM publication, currentness and release at measured cost. Historical runs keep their source and SDK identity; timings are not a controlled speedup benchmark. Bounded same-process warm readers qualify; cross-process reuse, native equivalence, other worlds and hosted cost remain open. Evidence: `reports/review/1045-current-tests-dom-qualification.md` and `reports/review/1045-current-tests-dom-warm-reuse.md`.

Maintained tests-DOM projection is declined: real CT support retains the server graph, so declarations add files without isolating it. Native checks and router conformance pass; this does not justify adopting the projection. Evidence: `reports/review/965-dom-router-qualification.md`.

Selected citation policies complete without tool errors; authority debt remains. Evidence: `reports/review/965-citation-resource-current-acceptance.md`.

AST routing declares per-verb store demand. Only `typeonly-alive` omits unused families; complete references and roots remain. CLI, factory and lifecycle controls pass review. Tooling types pass; inherited Node errors and world cost stay open. Evidence: `reports/review/965-ast-demand-routing.md`.
