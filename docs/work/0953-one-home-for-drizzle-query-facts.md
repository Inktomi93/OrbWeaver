---
kind: work
status: doing
updated: 2026-10-14
priority: P1
lane: codex/share-acme-harness-958
plan: test-foundation
---

# One home for drizzle query facts

## What

Tables, joins, subqueries, columns, reads and writes are read once in `tooling/src/floor/code-facts/`. Reuse existing schema, table, column and write-chain readers. Move remaining query, row and raw-SQL extraction from the AST column readers into shared facts; fold tenancy, JSON and client-call consumers onto those facts. Consumer adapters retain their output and policy judgments, not a second extraction. `pnpm ast columns`, tenancy, JSON, single-writer and byte-check-cast consumers share the complete schema population.

## Why

Gates and `pnpm ast` read drizzle code two ways, so a `pnpm ast` verb finds what a gate misses and every gate fix re-learns the same shapes.

## Done when

One drizzle reader in the floor; the old readers are deleted; `pnpm ast columns` output and every caller gate's findings are unchanged or a recorded improvement. The tenancy gates read through the new reader, and it flags every by-id spelling the item 980 security review planted: a by-id helper inside an object, a table-parameter helper, a bound FK column inside or() or a sql leaf, a schema namespace table, a const table alias, a const relational receiver, a non-$dynamic builder escaping to a helper, a builder returned from a function, split builder bindings at any depth, and a subquery or CTE whose ownerId column is relabelled from another table.

## Evidence

AST consumers share column, row-shape, selection and SQL readers. Keep classification consumer-owned. Statement, predicate, join and parser provenance still require complete acceptance.

Preserve native program identity, complete schema populations, unresolved outcomes and the foundation plan's persisted store contract. The precise security-case coverage matrix remains an implementation prerequisite; reconnaissance is not proof that a named case is missing or covered. The compose boundary is established. The native inventory store item owns persisted inventory construction; this assignment owns Drizzle extraction and its consumer judgments.

Preserve gate conformance cases and exact native spellings. Fixed traversal limits do not satisfy arbitrary-depth acceptance.

Bounded programs do not establish repository-native equivalence. Existing emit checks prove schema presence, not complete identity; grants cover broader owner populations. Preserve both deferred suites. Scoped compilation does not replace their verdict.

Reviewed source is integrated with the store and shape readers. Combined tooling/root types and the affected CT composition-policy suite pass. Full-row subquery and CTE provenance uses one admitted table and declared column; red-first controls and the corrected family pass. Unresolved, ambiguous and joined-source refusal remain. Native repository equivalence is pending.

Reviewed integration extends canonical caller observations, editable-builder continuations and returned parser provenance. Conditional spreads preserve alternative presence through ordered overrides. Relevant unresolved callable uses remain unproven alongside admitted calls. Native controls cover both unsafe orderings, safe alternatives, installed Drizzle behavior, stale worlds and cycles. Focused security review confirms the corrections; affected tests, lint and tooling types pass. Root types retain unrelated probe and legacy errors. Complete repository output and finding equivalence remain unqualified.

The reviewed schema adapter uses canonical SQL names and authored default-operation kinds. Installed Drizzle controls distinguish physical names from defaults and preserve omitted, empty and explicit-undefined name fallback. Native owner identity is required; ambiguous worlds, foreign source objects and dynamic names refuse. The corrected bounded case union passes with affected lint and tooling types; root retains unrelated diagnostics. Full repository equivalence remains pending.
