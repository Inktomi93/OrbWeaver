---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: contracts
lane: wt/agent-a05e04b95b7ac33b0
plan: unwired-code
---

# Create, list and theme inputs drop the keys nothing sends

## What

createBookSchema.description, createEntrySchema.keys and priority, listDocumentsInputSchema.origin, guidedSteerSchema.placement, workloadListInputSchema.limit and settingsRouter.duplicateTheme.name are accepted and read by their verbs, and no client, plugin SDK or automation path sends them. The demo seed in tooling/src/seed/ops/demo.ts sends the book description and the entry keys and priority. The client creates a book or entry minimal and edits it through the update schemas, which carry the same keys; it duplicates a theme by id and the server names the copy.

## Why

An input key with no sender is a branch no user can reach.

## Done when

Each key leaves its schema, router, verb and persistence branch; the demo seed and the tests that sent a key use the update path or the default; affected suites pass.

## Evidence

Filled at landing: what ran and where its output is.
