---
kind: bug
status: open
updated: 2026-10-31
priority: P3
area: client
---

# Name a failed image asset without a paged character lookup

## What

The Jobs row resolves each failed asset id to its character by matching avatarAssetId over a 500-row character.list page (packages/client/src/features/workloads/components/workload-failed-assets.tsx), which breaks the rule against resolving an entity from a paged list; past 500 characters it degrades to the raw id.

## Why

.claude/rules/server.md: never resolve an entity from a paged list; call its own get.

## Done when

The names come from a by-ids read or a name recorded at sweep time through an injected op, with no paged lookup, pinned by the failed-assets CT.

## Evidence

Filled at landing: what ran and where its output is.
