---
kind: decision
status: blocked
updated: 2026-11-06
priority: P3
area: server
blocked: owner
plan: unwired-code
---

# Decide the distilled setting facet on the character browse

## What

Decide whether the browse surface shows the setting facet distill produces, or whether distill stops asking for it.

## Why

Every distill call requires and stores setting, so each card pays for it, and no door shows it since its wire field was removed.

## Done when

The decision is recorded. If kept, the browse view carries and renders it. If dropped, the payload schema, the stored column through a numbered migration, and the prompt stop requesting it.

## Evidence

Filled at landing: what ran and where its output is.
