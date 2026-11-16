---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: chat-html-and-presets
---

# The narrator notice names one character when several hold the row plain

## What

`resolveNarratorRenderPolicy` in `packages/contracts/src/chat/roster.ts` names the first seat at the lowest trust step. When several characters share that step, the host's control opens one of them, and raising it leaves the row plain.

## Why

The remedy the notice offers does not work, and nothing says another character also holds the row.

## Done when

When several characters share the binding step, the notice says so and the host can reach each of them. A component test covers the tie.

## Evidence

Filled at landing: what ran and where its output is.
