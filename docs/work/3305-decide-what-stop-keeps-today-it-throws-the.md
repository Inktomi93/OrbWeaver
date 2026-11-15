---
kind: decision
status: open
updated: 2026-11-15
priority: P1
area: chat
---

# Decide what Stop keeps: today it throws the whole streamed reply away without a word

## What

Pressing Stop while a reply streams removes the reply entirely. The room ends on the user's line, with no partial text and no notice. This holds on every provider, with or without a styling preset. The client is silent on a user abort by design, and no ruling covers whether the text already streamed is kept.

## Why

A reader stops a long reply because they have read enough. Everything they read, which they paid for, vanishes. It reads as lost data and will be reported as a bug.

## Done when

A recorded ruling says what Stop keeps. The recommended ruling keeps the partial reply as a normal row marked stopped, with swipe and continue. The chat surface then does what the ruling says, and a test stops a streaming turn and asserts the stored and rendered result.

## Evidence

Filled at landing: what ran and where its output is.
