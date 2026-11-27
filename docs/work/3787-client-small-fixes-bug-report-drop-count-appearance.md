---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: client
lane: wt/agent-a6726678d1a085caf
plan: unwired-code
---

# Client small fixes: bug report drop count, appearance bindings, list band scope

## What

The public bug report computes browserErrors held and dropped and writes neither (packages/client/src/lib/bug-report-public.ts). The appearance carrier manifest names a file and symbol per consumer binding and its test checks neither. ListPaneHeaderView\.accent and back have had no writer since the character chats moved to the context panel, while item 2691 added a title reveal for that scoped band.

## Why

A report that hides dropped errors overstates its coverage, an unchecked binding can name a file that no longer exists, and an option nothing sets is dead UI.

## Done when

The bug report summary states how many browser errors were left out; the manifest test fails a binding whose file is missing or does not export its symbol; the lane reads 2691 and either removes accent, back and the scoped title branch with its CT or names the band that still needs them; the affected CTs pass.

## Evidence

Filled at landing: what ran and where its output is.
