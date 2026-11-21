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

The 3746 leg fixed tRPC context, constant-table, union-member, compound-assignment and paged-cursor reads and bucketed validate-only keys and acknowledgements. Not attempted or not fixable soundly: host-object writes such as a canvas, shapes handed to a dependency, serializer and zip writes, persisted store shapes, CEL facts, composition-root destructuring, schema-driven renderers, curated capability rows, PluginCardDataHit, WorkloadResultByKind keys, EmbeddingInvocationContext columns, the floor.ts marks spread typed as an empty object, TanStack field paths, fuzzy-search field lists and the runtime-built stats keys. Prior art to try: the TypeScript language service's own find-references (getReferencesAtPosition) follows mapped types and some keyof string literals, so it may attribute what the checker walk cannot; TypeScript still has an open feature request to track string-literal keys to properties, so dotted TanStack paths need splitting against the form data type argument; no-unused and ts-unused-class-members only cover class members and plain property access. TypeScript 7.1 API leads (@typescript/native 7.1.0-beta, dist/api/proto.generated.d.ts): getAliasSymbolOfType and getAliasTypeArgumentsOfType on a TanStack name's contextual type can recover DeepKeys<TFormData> and its data type, so a dotted path splits against TFormData; getTemplateTypeOfMappedType, getNameTypeOfMappedType and getTypeParameterOfMappedType replace hand walking of mapped templates; getTypeOfSymbolAtLocation gives the narrowed type at a read; getReferencedSymbolsForNode, already wrapped as NativeWorld.referencesAt in tooling/src/unwired/native.ts, is find-references over mapped and keyof keys; getSignatureUsages lists name and call pairs for a signature, a lead for 3806.

## Why

Rows in these classes still look dead in the fields report and would mislead the cleanup items.

## Done when

Each class has a red-first planted case with a dead twin and a checker-based fix, or a recorded reason it cannot be attributed with the rows listed for hand judgement; the orchestrator reruns the fields scan.

## Evidence

Filled at landing: what ran and where its output is.
