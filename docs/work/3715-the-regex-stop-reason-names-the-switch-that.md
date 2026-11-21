---
kind: bug
status: doing
updated: 2026-11-21
priority: P2
area: chat
lane: wt/agent-ac33ee7cbe2ea7472
plan: chat-html-and-presets
---

# The regex stop reason names the switch that exists and the Stopped chip keeps the script name readable

## What

The stop reason says switch it off in This chat, but the only switch on that row turns the script off everywhere; the Stopped chip truncates the script name. Copy: packages/client/src/features/chat/lib/regex-stop-copy.ts.

## Why

The copy sends the reader to a control that does something else.

## Done when

The reason names the control that is on the row, and the name stays readable beside the chip at phone width, with a CT.

## Evidence

Filled at landing: what ran and where its output is.
