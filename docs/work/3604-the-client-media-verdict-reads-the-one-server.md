---
kind: work
status: doing
updated: 2026-11-20
priority: P2
area: chat
lane: wt/agent-a8c72080671572f19
plan: chat-html-and-presets
---

# The client media verdict reads the one server media rule

## What

resolveFramedMediaVerdict in packages/client/src/lib/render-trust.ts re-derives the server's external-media rule (install ceiling and the character's forbid, as the card-frame posture applies them) on the client. The script verdict now has one home, resolveCardScriptVerdict in packages/contracts/src/chat/roster.ts, that the server posture and the client both call; the media verdict still has two copies.

## Why

Two copies of a trust rule drift, and then the notice says media is blocked while the frame loads it, or the reverse.

## Done when

One contracts function decides the media verdict and its reason; the server posture and the client verdict both call it; the inline copies are deleted; a table test covers every input combination.

## Evidence

Filled at landing: what ran and where its output is.
