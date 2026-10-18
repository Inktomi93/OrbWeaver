---
kind: plan
status: active
updated: 2026-10-18
---

# Native reference occurrences without repeated program searches

## Goal

Replace bulk declaration-by-declaration reference searches with persisted native occurrence facts and indexed reference queries. Preserve importing-world semantics and existing consumer judgments.

## Shape

### Reading priority

The [test-foundation plan](../test-foundation/design.md) owns order. The [test-mirror inventory](../test-mirror/design.md) supplies replacement cases. This subordinate extractor design is not another main program.

Complete the executing-input currentness delivery before changing its frozen extractor. Keep native gate migration and corpus smoke independent. The memory work item owns hosted qualification.

### Evidence and attribution

The bulk reference collector calls the native reference pass for each demanded declaration. The exact-query collector also calls that pass. The patched pass already reuses candidate positions, direct imports and retained results; it is not an uncached text scan.

The bulk collector runs only when the references family is demanded. Read the actual worker request before attributing a slow run to it. Invocation evidence can perform separate reference searches through the native workspace. Measure those paths separately.

[SCIP's TypeScript indexer](https://github.com/sourcegraph/scip-typescript/blob/main/src/FileIndexer.ts) traverses source nodes and emits occurrences with symbol identity and roles. It also handles contextual properties, shorthand bindings and declaration relationships. [Glean](https://glean.software/docs/indexer/lsif-typescript/) consumes SCIP for TypeScript. These are design references, not equivalence evidence.

[CodeQL's extractor change](https://codeql.github.com/docs/codeql-overview/codeql-changelog/codeql-cli-2.22.2/) replaces compiler-derived type entities with query-derived bindings. Its changed Type and Symbol APIs do not preserve our native checker contract automatically.

### Delivery sequence

1. Count bulk queries, exact queries, candidate visits and checker work by native family. Reuse captured profiles before starting another complete replay.
2. Extract occurrences during the existing native source traversal. Persist declaration links, alias relationships, roles, source spans and consumer classes in the existing store.
3. Answer reference queries through indexed occurrence relations. Preserve the current public reader and demanded-query semantics.
4. Compare complete results against native reference behavior on discriminating controls. Record unresolved cases explicitly instead of returning an empty answer.
5. Replace eligible bulk searches after parity and lifecycle controls qualify. Keep unported exact native queries explicit.
6. Measure complete expensive-world extraction and publication against matching input scope. Then measure the hosted and concurrent-consumer acceptance.

### World and invalidation boundary

Share physical syntax where identity permits. Keep bindings and typed occurrences keyed by native world and generation. Conditional imports, library globals and compiler options can change a file's meaning.

Changing a dependency can change bindings in an unchanged consumer. Invalidate affected semantic observations through source, resolution, configuration and dependency versions. File-local output does not imply file-only invalidation.

Keep complete selected roots and resolved closure. Publish coherent generations atomically; preserve pinned readers, changed-input refusal, worker release and transaction overlays.

### Consumer boundary

Retain aliases, reexports, merged declarations, overloads, shorthand properties, contextual members, computed members, namespace uses, JSX and type/value distinctions. A location can carry several meanings.

Reference lookup is not callable provenance. Keep allocation, argument bindings, property paths, mutation and escape judgments at their canonical owners. An occurrence index supplies facts; it does not establish runtime origin by itself.

Bounded member and module indexing preserves canonical native travel and fallback. Installed-SDK, SQLite and public AST controls pass in an isolated main-derived checkout. Shared-main installation and complete-world cost remain open. Evidence: `reports/review/1045-native-families-installed.md`.

## Rejected

Another store or detector; bigger heaps; reduced populations; merging native worlds by pathname; treating dependency changes as file-local; substituting approximate call or type answers for required native judgments.

## Coupled sites

The test-foundation plan owns scheduling. Items 955, 965, 1002 and 1027 own reference readers, cost, store lifecycle and native consumer delivery. Existing SQLite schemas, native workspace and compiler workers remain the implementation homes.

## Test plan

Prove native world differences, complete occurrence coverage, exact reference projections and alias relationships. Preserve current declared cases and explicit unresolved outcomes. Exercise dependency changes in unchanged consumers, coherent concurrent publication, pinned readers, disposal and overlays. Record whole-world wall time and physical process memory only after bounded parity passes.
