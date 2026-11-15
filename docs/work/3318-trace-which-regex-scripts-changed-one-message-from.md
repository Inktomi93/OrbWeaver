---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: regex
---

# Trace which regex scripts changed one message, from the message

## What

From a message's actions, show the scripts that ran on its display and prompt passes, in order, with each one's skip reason, using the room's real seats and depths.

## Why

The library pipeline panel (`packages/client/src/features/regex/components/regex-pipeline-panel.tsx`) has no room, so it cannot apply depth or author scope. Only a per-message trace can answer why a script did or did not touch this message.

## Done when

A message shows its script trace, and the skip reasons come from the kit's `regexSkipReason` over the message's own stamps.

## Evidence

Filled at landing: what ran and where its output is.
