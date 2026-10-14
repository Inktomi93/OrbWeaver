---
kind: work
status: open
updated: 2026-10-14
priority: P1
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

AST consumers share column, row-shape, selection and SQL readers. Classification remains consumer-owned. Preserve native program identity, complete schema populations and unresolved outcomes; fixed traversal limits do not satisfy arbitrary-depth acceptance.

The native inventory item owns persistence and complete replay. This assignment owns Drizzle extraction and consumer judgments. Bounded programs and schema-presence checks do not establish repository-native equivalence or complete owner qualification. Preserve the deferred emit and population suites.

Shared readers retain full-row subquery/CTE provenance, complete caller alternatives, conditional-spread presence, returned parser provenance and editable-builder lifetimes. Unresolved, ambiguous, joined-source and unsafe-alternative refusals remain. Canonical schema facts preserve physical SQL names, actual default operations and omitted/empty/undefined name fallback; foreign source objects and dynamic names refuse.

Reviewed `cb26ce442e` extends supplied formals, finite actual callable bodies and imported/returned native carriers. One physical-use traversal follows SELECT, EXISTS, templates, aliases and first SQL conversion through complete consumers. Path-local cycle refusal replaces checker overflow. Runtime defaults cannot disappear through explicit undefined; native symbol identity distinguishes shadows. Callable VALUE identity supports namespace-merged functions without weakening module ambiguity or granting UI ownership.

The same reviewer accepts the inline-wrapper and default-normalization corrections. Matching native positives, unsafe controls, actual runtime sharing and consumer cases pass. The final affected command retains a superseded fixture failure; its corrected case passes separately. Tooling types and exact lint pass; root types retain off-owned failures. No combined whole-command green is claimed.

Generic table enumeration, imported destructured CTE lifetimes, INNER JOIN ON correlations and unavailable higher-order consumers remain unqualified. Containment supplies no authority. Complete repository output/finding equivalence and remaining schema-case acceptance stay open.

Reviewed `5423bfb5d9` stops fluent extraction at delivered await values. Native execution, mutable SQL lifetime and owner predicates remain separate judgments. Native policy positives and unsafe controls pass; complete equivalence remains open.
