---
kind: bug
status: doing
updated: 2026-11-12
priority: P2
area: security
lane: wt/agent-a83a3dac07c50924b
plan: authorization-and-visibility
---

# A member's picture request does not spend a disabled host's connections

## What

Room picture generation and prompt extraction run on the host's image and Utility connections (D298). `packages/server/src/domain/chat/verbs/generate-image.ts` and `packages/server/src/domain/chat/verbs/imagery-room-access.ts` check that the host is present and never that the host is enabled, so a member can spend a disabled host's inference. The host owns the result, so the member then gets not-found for the picture.

## Why

A disabled human is treated exactly like a departed one, and this path spends a disabled account's inference for a picture nobody can see.

## Done when

The imagery room access reads the room's present and enabled set, and a test through the production verb shows no provider request while the host is disabled and a working request after the host is enabled again.

## Evidence

Filled at landing: what ran and where its output is.
