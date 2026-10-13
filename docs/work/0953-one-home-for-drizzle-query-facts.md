---
kind: work
status: doing
updated: 2026-10-13
priority: P1
lane: codex/drizzle-facts-953
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

AST column consumers call shared column-reference, row-shape, selection and SQL readers. Preserve consumer-specific classification and reporting rather than treating every remaining adapter as duplicate extraction. Statement, predicate, join and parser provenance still require complete acceptance coverage. A bounded walk does not justify another program.

Preserve native program identity, complete schema populations, unresolved outcomes and the foundation plan's persisted store contract. The precise security-case coverage matrix remains an implementation prerequisite; reconnaissance is not proof that a named case is missing or covered. The compose boundary is established. The native inventory store item owns persisted inventory construction; this assignment owns Drizzle extraction and its consumer judgments.

Gate-owned conformance fixtures remain maintained proof. Native controls must exercise the exact required spelling, not only a nearby pattern. Preserve existing cases and avoid duplicate controls. A fixed traversal limit does not satisfy arbitrary-depth acceptance.

Bounded consumer controls use virtual native-shaped programs. They do not establish repository-native output or finding equivalence. The existing native emit suite checks schema presence, not complete table identity; the grant suite covers broader owner populations. Keep those checks deferred and intact until main adjudicates their actual coupling and required native proof. Scoped typechecks and import graphs do not replace that verdict.

Reviewed source is integrated with the store and shape readers. Combined tooling/root types and the affected CT composition-policy suite pass. Full-row subquery and CTE provenance uses one admitted table and declared column; red-first controls and the corrected family pass. Unresolved, ambiguous and joined-source refusal remain. Native repository equivalence is pending.

The candidate extends canonical caller observations, editable-builder continuations and returned parser provenance. Native controls cover the security spellings, stale worlds, cycles and actual installed Drizzle behavior. Complete repository output equivalence remains separate.

Independent review rejects the candidate's conditional spread provenance: a raw present alternative can disappear when another branch lacks the member. Preserve alternative presence through ordered overrides; only absent alternatives fall back. The returned-builder assignment also requires caller completeness. Both corrections precede the final commit and focused review.
