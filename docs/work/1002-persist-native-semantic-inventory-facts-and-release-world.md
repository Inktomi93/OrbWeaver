---
kind: tooling
status: doing
updated: 2026-10-13
priority: P1
area: tooling
lane: codex/native-late-diagnostic-1002
plan: test-foundation
---

# Persist native semantic inventory facts and release world programs

## What

Implement the planned persisted native-world inventory store and worker lifecycle. Existing alias-aware collectors consume shared export origins, module targets, bindings and physical references without retaining every native program. Keep unported typed consumers on explicit native views.

## Why

Complete cold replay exhausts the client worker's heap during native partition construction. Allocation samples expose retained source-fact and native-reference costs. The eventual failure phase remains unmeasured. The program requires shared persisted facts, not larger heaps, truncated populations or another detector.

## Done when

Native partitions preserve options, roots, dependency closure and unresolved outcomes. Worker programs release before publication. Content-version invalidation, change-during-build refusal, atomic complete cross-world generations, reader pinning, concurrent reuse and transaction-overlay isolation pass discriminating controls. Existing collector outputs preserve alias, dynamic-import, namespace, type/value and consumer-class meaning. Frozen replay completes with measured peak after controls and review; no heap increase or fake program.

## Evidence

Reviewed descriptor and query corrections preserve configuration mutation refusal, native resolution, selected subsets and overlays. Native declaration/name keys share results. Primitive query spans and wrapper-free projection preserve ordering, alias filtering and physical spans. Lifecycle and ancestor controls fail before correction; affected extraction, inventory parity, lint and configs pass. Complete memory qualification remains pending.

The integrated extractor shares the language-service checker and preserves bootstrap roots, closure, order and native source identity. Ownership and cleanup controls pass. Complete frozen replay still fails with client-worker heap OOM at the unchanged limit. No complete partition, inventory or current production usage verdict exists. Frozen Knip bytes and root identities remain preserved. GNU time reports command-and-descendant high water, not simultaneous aggregate memory.

Independent review confirms extraction-local resolved-path interning and frozen span reuse. Complete bounded facts, native query order and roots remain equal. Scoped controls, lint and tooling types pass; root types retain unrelated probe and legacy errors. No measured memory saving or complete replay qualification is established.

The bounded client diagnostic reaches its external deadline during reference extraction without OOM. Worker-side collection and public allocation sampling preserve the complete native roots and closure. Post-collection heap grows from 1.10 GB at language-service readiness to 4.08 GB after source facts and 5.41 GB during references. JSON serialization and SQLite publication remain unmeasured.

Source-fact samples identify retained canonical-path strings and checker instantiations. Early reference growth includes native token-tree construction through `findReferencedSymbols`, `getTokenAtPositionWorker` and `getChildren`. These are sampled allocation sites, not exact dominators or proof of the eventual OOM owner. Standalone wrapper release does not remove those costs.

Extraction uses the compiler bundled with ts-morph, not the native TS7 typechecker. Client and root descriptors remain separate browser and Node programs. The language-service host exposes cached closure paths as roots; this does not establish combined worlds or permit changing native membership.

The active complete-root client diagnostic uses sparse public sampling and durable query/publication markers, without forced collection. Preserve frozen inputs and failed artifacts; no private cache clearing, heap increase or population reduction. Instrumented client results do not qualify all worlds or clean timing.
