---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: credentials
lane: wt/agent-af34818252fd77fd2
plan: unwired-code
---

# The add-connection form can send extra headers when it lists models

## What

connection.draftCatalogModels accepts headers (packages/server/src/transport/trpc/routers/connection.ts) and the add form has no headers field, so draft-models-check.tsx lists models without them; extra headers exist only in the saved connection's transport editor.

## Why

An endpoint that needs a header to list models fails the check before save and works after.

## Done when

The add form offers extra headers, the draft check sends them, the saved connection keeps them, and a CT covers a header-required listing.

## Evidence

Filled at landing: what ran and where its output is.
