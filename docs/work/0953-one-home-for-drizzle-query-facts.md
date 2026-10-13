---
kind: work
status: doing
updated: 2026-10-13
priority: P1
lane: codex/compose-policy-995
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

Reuse the floor's schema, table, write-chain and column readers. Preserve the AST table adapter's output projection.

Remaining extraction includes AST query, row and raw-SQL read facts, plus statement, predicate, join and parser provenance consumed by tenancy and JSON judgments. Keep consumer-specific ownership and reporting judgments separate from shared fact extraction. A bounded walk is not automatically a duplicate or a reason to create another program.

Preserve native program identity, complete schema populations, unresolved outcomes and the foundation plan's persisted store contract. The precise security-case coverage matrix remains an implementation prerequisite; reconnaissance is not proof that a named case is missing or covered. The compose boundary is established. The native inventory store item owns persisted inventory construction; this assignment owns Drizzle extraction and its consumer judgments.

Gate-owned conformance fixtures are maintained proof, not only standalone test files. The focused tenancy inventory confirms table-parameter refusal, FK disjunction and namespace-table controls. Nearby predicate, dynamic-builder, shallow-binding and unscoped-subquery controls do not prove the exact required spellings. Preserve them and require discriminating controls for object-contained helpers, FK SQL leaves, read aliases, relational receiver aliases, non-dynamic escapes, returned read builders, deeper split bindings and relabelled owner columns. Confirm the remaining fixture population before claiming absence or adding duplicate controls. The existing traversal limit does not satisfy arbitrary-depth acceptance.

Bounded consumer controls use virtual native-shaped programs. They do not establish repository-native output or finding equivalence. The existing native emit suite checks schema presence, not complete table identity; the grant suite covers broader owner populations. Keep those checks deferred and intact until main adjudicates their actual coupling and required native proof. Scoped typechecks and import graphs do not replace that verdict.

The reviewed correction preserves full-row subquery and CTE owner-column provenance through the ready schema model. Red-first controls, the corrected family and affected static checks pass. Match one admitted table and declared column; preserve unresolved, ambiguous and joined-source refusal. Main integration must preserve the store and shape-reader APIs; native repository equivalence remains pending.
