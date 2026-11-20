---
kind: decision
status: doing
updated: 2026-11-20
priority: P1
area: client
lane: wt/agent-a0f363f919c3e186a
plan: cross-surface-consistency
---

# The phone tab bar marks the current tab by more than colour

## What

The current phone tab is marked by its tint and ink alone (`packages/client/src/features/app-shell/surfaces/shell/mobile.css`).

## Why

A state signalled by colour alone fails a reader who cannot tell the tint apart.

## Done when

The owner has answered the current-tab question in ui-surface-and-interaction-rules §7, and the bar follows the answer.

## Evidence

Filled at landing: what ran and where its output is.
