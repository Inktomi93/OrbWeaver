---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: authorization-and-visibility
---

# A member's hide or delete beside a struck scene does not drop unstruck turns from the host's memory

## What

A summary that shares any turn with a struck span is left out whole (`packages/kit/src/recall/index.ts`). A member's own hide or delete shifts the block grid, so a block beside a struck scene can come to hold one struck turn and be left out, taking up to one block of unstruck turns with it at each edge of the span. A security review found it by reading; the admin's block size change has the same effect and is accepted.

## Why

The host loses memory of turns they did not strike, caused by another person's edit.

## Done when

A ruling states whether the edge loss is accepted. If not, a case shifts the grid by a member's delete beside a struck span and shows the unstruck turns still reach the prompt.

## Evidence

Filled at landing: what ran and where its output is.
