---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: client
lane: wt/agent-aa8988717799db7a7
plan: unwired-code
---

# Authored artifacts show when they were made and changed

## What

Create or edit stamps on authored rows are written and never projected: characters.updatedAt, globalVariables.updatedAt, rosterPresets.createdAt, rpgSheets.updatedAt, themes.updatedAt, worldBooks.updatedAt, worldEntries.createdAt, worldEntries.updatedAt, tags.createdAt. packages/server/src/foundation/observability/contract/inspect.ts:9 wrongly says characters has no updated_at.

## Why

Owner ruling : data collected and never shown is a product item.

## Done when

Each artifact surface shows or sorts by the stamp where the design system has a slot for it, the stale inspect comment is fixed, and a rendered check covers each surface.

## Evidence

Filled at landing: what ran and where its output is.
