---
kind: work
status: open
updated: 2026-11-23
priority: P3
area: chat
plan: unwired-code
---

# The setActivePersona router stops accepting targetUserId

## What

The setActivePersona router input in packages/server/src/transport/trpc/routers/persona.ts accepts targetUserId so a host can choose another participant's active persona in one chat. The verb writes chat_participants.activePersonaId for that participant and requires the persona to be one the target owns. The client types its input without targetUserId and no test or spec sends it over tRPC; the verb parameter is live through server calls. Open question from the owner: whether this per-room active persona is the same thing as the room pin, or a separate slot.

## Why

An accepted input with no sender is either a missing host control or surface to remove; the router comment promises the seam.

## Done when

Owner ruling: drop the targetUserId key from the setActivePersona router input and amend the router comment, keeping the verb parameter for server callers; no host control is built. The router input refuses targetUserId, the persona router tests pass, and no client or spec sends it.

## Evidence

Filled at landing: what ran and where its output is.
