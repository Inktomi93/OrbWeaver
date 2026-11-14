---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: server
---

# An ended plugin invocation keeps its strike when its answer frame is refused

## What

An invocation the host ends at its settlement wall answers through the broker. When that answer's own frame finds the channel share full, the broker's `answer` in `packages/server/src/infra/plugin-host/broker-entry.ts` or the watchdog relay in `packages/server/src/infra/plugin-host/process-channel.ts` turns it into a refusal, and the command is excused. The stuck-runtime path already sends its ended outcome as a control frame, which the share cannot refuse.

## Why

D347 states that an ended invocation strikes. A plugin that keeps its share full when the wall fires would stall without a strike.

## Done when

An answer whose error is the ended outcome travels as a control frame, and a server case shows an ended invocation with a full share takes its strike. The case needs a test edge that reaches the broker's own refusal; report the gap if none exists.

## Evidence

Filled at landing: what ran and where its output is.
