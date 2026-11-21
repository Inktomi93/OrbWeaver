---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: chat
plan: chat-html-and-presets
---

# The prompt preview names the world info entries the budget dropped

## What

AssembleTrace.worldInfoDropped (packages/contracts/src/chat/assemble.ts) carries each dropped entry's id and its budget reason, and assembly-preview-diagnostics.tsx shows only the count.

## Why

A user cannot see which lore entries did not fit the world info budget.

## Done when

The preview lists each dropped entry by its book and title with the reason and opens the entry; a CT covers a budget that drops one entry.

## Evidence

Filled at landing: what ran and where its output is.
