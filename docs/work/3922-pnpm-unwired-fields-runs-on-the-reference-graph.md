---
kind: tooling
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# pnpm unwired fields runs on the reference graph

## What

pnpm unwired fields still runs on engine one (fields.ts). The graph has taken acknowledged, plugin-SDK received, interface redeclaration reads, reflective reads, parameter-key narrowing and the z.ZodType and z.lazy twins. These fields recognitions remain to port into graph/judge.ts or the flow walk, each with a red-first graph case: a key overriding a spread copy builds no home; a table under satisfies Record\<K, T> reads through T; an array spread fills the element type; a tRPC paged query writes its input cursor; an inferred type argument links to the constraint; an extend checked against its own type does not read the base key; a client vars twin writes through mutationOptions; open-send destinations (in-tree log sink, render and query deps, the provider request chase as a provider destination); compared JSON.stringify and dotted-path reads; TanStack form paths; any-receiver reads as unresolved. Then switch the verb: fields becomes a projection of the judged member rows, refuses --cross-check, fields.ts is deleted and field-declarations.ts stays for brand-flow. The 3922 lane report under reports/lanes/ holds the held projection, the red table and the expected moved-row classes.

## Why

D357: one core. Fields is the largest scan left on the old engine, and 3904 cannot delete it until fields moves.

## Done when

fields is a query over the graph and the 3891 judging; a row-by-row diff against the current fields report explains every moved row; the old fields engine path is deleted in the same change; its planted suites pass.

## Evidence

Filled at landing: what ran and where its output is.
