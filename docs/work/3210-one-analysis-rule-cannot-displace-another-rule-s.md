---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: automation
---

# One analysis rule cannot displace another rule's newer guidance

## What

`commitPassState` in `packages/server/src/domain/automation/persistence/rule-state.ts` sets the row's update stamp on every pass and writes guidance only when the pass produced some, while `selectChatGuidance` returns the non-empty guidance with the newest stamp. A rule holding old guidance that runs a pass with none becomes newest and outranks a fresher line from a second rule. Order guidance by a stamp that moves only when guidance is written.

## Why

The guidance channel is a single narrator instruction, so the wrong rule winning changes what every later turn is told.

## Done when

A test with analysis rules sharing a chat shows that a rule which wrote guidance later wins even after the other rule runs a later pass that wrote none.

## Evidence

Filled at landing: what ran and where its output is.
