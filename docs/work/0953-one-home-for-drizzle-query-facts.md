---
kind: work
status: doing
updated: 2026-10-19
priority: P1
lane: wt/agent-af4b09cfaaa5cb0c1
plan: test-foundation
---

# One home for drizzle query facts

## What

Tables, joins, subqueries, columns, reads and writes are read once in `tooling/src/floor/code-facts/`. Reuse existing schema, table, column and write-chain readers. Move remaining query, row and raw-SQL extraction from the AST column readers into shared facts; fold tenancy, JSON and client-call consumers onto those facts. Consumer adapters retain their output and policy judgments, not a second extraction. `pnpm ast columns`, tenancy, JSON, single-writer and byte-check-cast consumers share the complete schema population.

## Why

Gates and `pnpm ast` read drizzle code two ways, so a `pnpm ast` verb finds what a gate misses and every gate fix re-learns the same shapes.

## Done when

One Drizzle reader supplies supported facts to AST and gates. D328 bounds the query language instead of requiring arbitrary helper and builder closure. Classify every claimed read; partial coverage reports unsupported forms as unknown. Native restrictions and production-root ownership controls qualify before retiring old enforcement. No query-language rewrite by default. Record supported output parity and intentional unsupported results.

## Evidence

AST consumers share column, row-shape, selection and SQL readers. Classification remains consumer-owned. Preserve native program identity, complete schema populations and explicit unresolved outcomes. D328 replaces arbitrary-depth acceptance with a closed supported contract.

The native inventory item owns persistence and complete replay. This assignment owns Drizzle extraction and consumer judgments. Bounded programs and schema-presence checks do not establish repository-native equivalence or complete owner qualification. Preserve the deferred emit and population suites.

Shared readers retain full-row subquery/CTE provenance, complete caller alternatives, conditional-spread presence, returned parser provenance and editable-builder lifetimes. Unresolved, ambiguous, joined-source and unsafe-alternative refusals remain. Canonical schema facts preserve physical SQL names, actual default operations and omitted/empty/undefined name fallback; foreign source objects and dynamic names refuse.

Reviewed `cb26ce442e` extends supplied formals, finite actual callable bodies and imported/returned native carriers. One physical-use traversal follows SELECT, EXISTS, templates, aliases and first SQL conversion through complete consumers. Path-local cycle refusal replaces checker overflow. Runtime defaults cannot disappear through explicit undefined; native symbol identity distinguishes shadows. Callable VALUE identity supports namespace-merged functions without weakening module ambiguity or granting UI ownership.

Native wrapper, default-normalization, runtime-sharing and unsafe controls pass. Tooling types and exact lint pass; root types retain off-owned errors. Matching checks remain reusable.

Reviewed `849095f170` qualifies finite generic table alternatives, imported destructured CTE lifetimes, INNER JOIN correlations and finite supplied callback consumers. Unknown, mutable and opaque alternatives refuse. Scalar metadata does not erase SQL-carrier obligations. Path-local cycle refusal replaces the CTE depth cutoff. Final affected controls and tooling types pass; superseded aggregate failures remain recorded. Evidence: `.claude/worktrees/codex-drizzle-native-953/reports/review/953-native-drizzle-independent-review.md`. Containment supplies no authority. Complete repository equivalence and schema qualification remain open.

Reviewed `5423bfb5d9` stops fluent extraction at delivered await values. Native execution, mutable SQL lifetime and owner predicates remain separate judgments. Native policy positives and unsafe controls pass; complete equivalence remains open.

Owed before landing: a per-case version table for every reader folded so far (the case, each old version's behavior, the version kept, and why it is the correct, stronger recognition), per the plan's workstream 1. The merged vocabulary commit proved parity only.
