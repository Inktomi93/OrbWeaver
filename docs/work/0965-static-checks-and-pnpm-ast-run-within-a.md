---
kind: bug
status: open
updated: 2026-10-16
priority: P1
plan: test-foundation
---

# Static checks and pnpm ast run within a standard CI runner's memory

## What

Prioritize structural cuts: D320 legacy analysis eligibility, unnecessary typed-gate removal and AppRouter type-bridge closure isolation. Separate compiler baseline cost from additional analysis work, with runtime and checker concurrency explicit.

Compare batched TS7 checker extraction with TS6 on matched complete worlds, measuring client and server memory. Keep pins unchanged during external experiments. Shared persisted facts serve consumers without private programs.

## Why

Public checks must fit hosted runners and contributor machines, not only a large workstation.

## Done when

pnpm check, the structure stage and every pnpm ast verb complete within the hosted runner's memory with their peak recorded; concurrent pnpm ast verbs share the one store.

## Evidence

The correctly invoked `pnpm ast apisurface --in /src/ --public --json --max 1000000` completes on managed Node 26.10.0. Its timing artifact records exit 0, elapsed 2:37.88 and maximum RSS 15,719,224 KiB, without swaps. The JSON reports complete output, with total and shown equal. This measures one verb; it does not establish every tool's hosted-runner qualification.

Bounded controls preserve one native project per demanded descriptor across shared collectors.

The sequential native UI export projection completes on managed Node with a released worker per demanded world. Its timing artifact reports exit 0, elapsed 1:58.62 and maximum RSS 2,501,396 KiB without swaps. This measures the bounded UI selector work set, not the full apisurface verb or aggregate concurrent-process memory. It neither diagnoses the earlier wrapper's aborting phase nor establishes a persisted shared store.

The supported composite diagnostic on `a5c7f1e3d1` terminates at API-surface entry with V8 heap exhaustion: exit 134, elapsed 5:42.32, peak 17,438,568 KiB without swaps. Managed Node 26.10.0 retains the unchanged heap setting. Corpus enumeration observes one native Project per descriptor; shared liveness completes with no identity changes or further world demand. No complete inventory verdict exists.

This locates the custom sequence's aborting operation, not its allocation cause or a shipped-command failure. Later collectors do not run. Preserve existing logs instead of repeating this phase.

The corrected frozen replay reaches its fixed deadline in the tests-DOM native world, without an OOM or source-identity diagnostic. Prior worlds finish staging and parent import; remaining worlds and collectors do not run. Generation stays zero. The terminal report records per-process RSS, swap and exact scope: `/tmp/ast-native-full-current-1002/result-summary.md`. Profile the failed world before another complete replay; staged input currency remains unqualified.

Reviewed `49d607fd3c` removes repeated path resolution and native import-map construction. Complete tests-DOM cold publication passes at frozen `7394d01aaf` in 73:47.834. Sampled parent-plus-worker RSS peaks at 10.977 GiB without sampled swap; this is not a continuous physical-memory peak. Inputs revalidate and owned processes exit. Evidence: `.claude/worktrees/codex-tests-dom-profile-1002/reports/review/1002-tests-dom-postfix-qualification.md`. Multi-world replay, collector equivalence, concurrent reuse and hosted measurements remain open.

Portable corpus contracts remove the Node and server import closure while retaining exhaustive Node router conformance. Other world totals remain unverified. Declaration bridges need freshness and closure qualification; D320 retains legacy runtime and native typecheck evidence without semantic extraction. Evidence: `reports/review/1040-portable-corpus-ordinary.md`.

Matched tests-DOM bindings complete on TS6 and both TS7 backends. Canonical differences remain; full extraction and root comparison are unqualified. Evidence: `reports/review/1002-ts7-checker-benchmark.md`.
