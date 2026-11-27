---
kind: bug
status: doing
updated: 2026-11-27
priority: P3
area: chat
lane: wt/agent-af34818252fd77fd2
plan: unwired-code
---

# A recovered prose-less turn keeps the first pass's refusal and denial notices

## What

packages/server/src/domain/chat recover-narrative.ts returns only the recovery pass's runner events and warnings, so a refusal or tool denial in the first pass raises no notice when the turn is recovered.

## Why

The person sees a reply with no word that the first attempt was refused or a tool was denied.

## Done when

A recovered turn carries both passes' runner events and warnings, deduped, with a test through the composed turn.

## Evidence

Filled at landing: what ran and where its output is.
