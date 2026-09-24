---
kind: bug
status: open
updated: 2026-09-24
priority: P2
area: chat
---

# Static and dynamic system halves keep the dragged section order

## What

isSectionDynamic (packages/server/src/domain/chat/assembly/assemble.ts:691) moves every dynamic section after all static ones. Make the split positional: static ends at the first dynamic section, and everything after keeps its prompt order.

## Why

ADR 0251 says every section stays where the prompt order puts it. A trigger-gated custom entry dragged between card fields lands after every static section today.

## Done when

An assembly test shows a dynamic section dragged between two static sections keeps its position, and the static block still carries the cache marker.

## Evidence

Filled at landing: what ran and where its output is.
