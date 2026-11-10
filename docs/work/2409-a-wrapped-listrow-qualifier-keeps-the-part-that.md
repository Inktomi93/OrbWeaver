---
kind: bug
status: open
updated: 2026-11-10
priority: P2
area: ui
plan: cross-surface-consistency
---

# A wrapped ListRow qualifier keeps the part that tells rows apart

## What

At 200% text on a phone, a ListRow qualifier that drops to its own line starts with the separator dot and truncates (for example a date cut mid-year), so rows in Home Other rooms and the Chats list read identically. packages/ui/src/primitives/list-row/variants.ts says the distinguishing part must never be cut.

## Why

Rows that look identical cannot be told apart, which defeats the qualifier.

## Done when

A qualifier on its own line drops its leading separator and wraps rather than truncating, or keeps its distinguishing segment whole, proven by a CT on two rows that differ only in the qualifier at 200% phone.

## Evidence

Filled at landing: what ran and where its output is.
