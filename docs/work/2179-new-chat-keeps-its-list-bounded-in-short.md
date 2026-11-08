---
kind: bug
status: open
updated: 2026-11-08
priority: P1
area: ui
plan: cross-surface-consistency
---

# New chat keeps its list bounded in short landscape at enlarged text

## What

New chat at 844x390 with 200% text loses its list bound: the list grows to the full roster height and Start sits after every row, tens of thousands of pixels down. The keystroke and skeleton CTs run short landscape only at 100%.

## Why

A landscape phone at enlarged text cannot reach Start, so it cannot start a chat.

## Done when

At 844x390 and 568x320 with 200% and 300% text the list stays bounded and Start is reachable, with cells added to new-chat-picker-skeleton.ct.tsx that go red on the current tree. Source: acceptance part 1 report.

## Evidence

Filled at landing: what ran and where its output is.
