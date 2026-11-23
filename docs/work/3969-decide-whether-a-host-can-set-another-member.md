---
kind: decision
status: open
updated: 2026-11-23
priority: P3
area: chat
plan: unwired-code
---

# Decide whether a host can set another member's active persona from the client

## What

The setActivePersona router input in packages/server/src/transport/trpc/routers/persona.ts accepts targetUserId so a host can choose another participant's active persona in one chat. The verb writes chat_participants.activePersonaId for that participant and requires the persona to be one the target owns. The client types its input without targetUserId and no test or spec sends it over tRPC; the verb parameter is live through server calls. Open question from the owner: whether this per-room active persona is the same thing as the room pin, or a separate slot.

## Why

An accepted input with no sender is either a missing host control or surface to remove; the router comment promises the seam.

## Done when

The owner rules: build a host control that sends targetUserId, with its authorization covered by a test, or drop the zod key and amend the router comment; the verb parameter stays either way.

## Evidence

Filled at landing: what ran and where its output is.
