---
kind: tooling
status: open
updated: 2026-11-21
priority: P3
area: tooling
plan: unwired-code
---

# The unwired fields scan reads the remaining false-positive classes

## What

The 3746 leg fixed tRPC context, constant-table, union-member, compound-assignment and paged-cursor reads and bucketed validate-only keys and acknowledgements. Not attempted or not fixable soundly: host-object writes such as a canvas, shapes handed to a dependency, serializer and zip writes, persisted store shapes, CEL facts, composition-root destructuring, schema-driven renderers, curated capability rows, PluginCardDataHit, WorkloadResultByKind keys, EmbeddingInvocationContext columns, the floor.ts marks spread typed as an empty object, TanStack field paths, fuzzy-search field lists and the runtime-built stats keys. Prior art to try: the TypeScript language service's own find-references (getReferencesAtPosition) follows mapped types and some keyof string literals, so it may attribute what the checker walk cannot; TypeScript still has an open feature request to track string-literal keys to properties, so dotted TanStack paths need splitting against the form data type argument; no-unused and ts-unused-class-members only cover class members and plain property access. Probed on the TypeScript 7.1 API (fixtures in the session scratchpad, tsapi-probe): a TanStack form's type carries alias ReactFormExtendedApi with TFormData as its first alias type argument, and walking a dotted path segment by segment with getPropertyOfType reaches the leaf property's declaration, so field-path writes are attributable; the resolved call signature is instantiated to the literal and is not the route. getReferencedSymbolsForNode follows homomorphic mapped types and element-access string keys, but not a non-homomorphic Overwrite mapped type nor a keyof-typed argument such as pick(obj, "key"). The runtime-built stats keys in tokenSampleSlice (packages/server/src/domain/chat/substrate/stats-delta.ts) and the floor.ts marks spread close with a type instead: a template-literal return type over the prefix, axis and suffix unions, and a typed marks object, after which the checker sees each key. getSignatureUsages is a lead for 3806, and @vitest/coverage-v8 with pnpm test:coverage already exists for 3809. Web check: non-homomorphic mapped properties having no link to their source is a known TypeScript gap (microsoft/TypeScript issues 25607 and PR 42971, symbols created without declarations), so the 3746 template walk stays the route; string literals as keys in find-references is open (issues 45549 and 11997). Probe: a literal annotated keyof Ctx has contextual type keyof Ctx, an index type naming Ctx, so it is attributable; a generic pick(obj, "key") argument is instantiated to the literal, so attribution goes through the call's target signature, where K's constraint keyof T names the parameter whose argument type gives T.

## Why

Rows in these classes still look dead in the fields report and would mislead the cleanup items.

## Done when

Each class has a red-first planted case with a dead twin and a checker-based fix, or a recorded reason it cannot be attributed with the rows listed for hand judgement; the orchestrator reruns the fields scan.

## Evidence

Filled at landing: what ran and where its output is.
