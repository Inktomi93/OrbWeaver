---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: chat
plan: test-foundation
---

# No node test covers the frame lift's restore and drop rules

## What

The lift's restore and drop rules, its code-element home, its bail-out when the reply holds every private-use stand-in character, and its per-reply cache key have no test. The component test covers the positive path only.

## Why

A stand-in left in an attribute went unnoticed because nothing asserts where a stand-in may land.

## Done when

A node test renders FrameMarkdown in its frame document context and asserts each rule, and each assertion fails under a mutation of that rule.

## Evidence

Filled at landing: what ran and where its output is.
