---
kind: work
status: open
updated: 2026-10-20
priority: P2
plan: test-foundation
---

# Route the remaining fact families through the session loader

## What

After 1166, complete references, reference queries, export declarations, Drizzle calls, invocation evidence, global bindings and the schema catalogs still read outside the session loader; the lease's InvocationReadSnapshot is a second per-session memo; the reader's catalog maps admit spans before retaining; NativeTypeFactReader in project-context.ts has no many-key door. Census: reports/review/1166-lookup-census.md.

## Why

One loader per session is the single home for batched reads; a second memo or per-key reader is a second copy of the concept.

## Done when

Each listed family reads through the loader with identical output and measured statement counts; InvocationReadSnapshot folds into the loader with its security-reviewed validation intact; the catalog maps admit before retention; NativeTypeFactReader gains a batch door used by its consumers.

## Evidence

Filled at landing: what ran and where its output is.
