---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: connection
lane: wt/agent-af34818252fd77fd2
plan: unwired-code
---

# The connection editor shows the capability-synthesis warnings

## What

The runtime's capability synthesis returns warnings (packages/server/src/domain/connection/verbs/resolve.ts), but the editor shows only the cache warnings and the old fields scan dropped ConnectionCapabilityView\.warnings.

## Why

Owner rule: data the app collects and never shows is a product item.

## Done when

The editor renders the warnings beside the capability rail with a CT, after a check that no other surface already shows them, or the item records why they are operator-only.

## Evidence

Filled at landing: what ran and where its output is.
