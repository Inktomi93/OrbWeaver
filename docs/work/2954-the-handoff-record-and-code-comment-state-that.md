---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# The handoff record and code comment state that the persona pin is never touched

## What

`docs/adr/0131-a-host-handoff-carries-an-opt-in-class.md` section (G) and the doc comment on the handoff in `packages/server/src/domain/chat/verbs/participants.ts` say the anchor persona heals at a handoff. D315 rules that the pin is never touched, and no code touches it.

## Why

A reader who trusts the record expects a heal that does not happen and may build on it.

## Done when

The record and the comment state what D315 rules and the code does.

## Evidence

Filled at landing: what ran and where its output is.
