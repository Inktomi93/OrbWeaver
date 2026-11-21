---
kind: tooling
status: open
updated: 2026-11-21
priority: P3
area: tooling
plan: unwired-code
---

# The unwired tool reports database columns nothing reads or writes

## What

The fields scan covers contracts and TypeScript types, not the drizzle schema; sessions.label was found only from a comment.

## Why

A dead column costs every migration and reads as stored product state.

## Done when

pnpm unwired gains a columns verb that counts, per drizzle column, its select and write sites in production, with a planted-fixture test, and the orchestrator judges its first report.

## Evidence

Filled at landing: what ran and where its output is.
