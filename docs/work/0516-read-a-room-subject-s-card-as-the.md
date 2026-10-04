---
kind: bug
status: open
updated: 2026-10-03
priority: P2
area: imagery
---

# Read a room subject's card as the host in the picture gates

## What

generatePicture's reuseGate and avatarReferenceGate read the subject card with p.caller. In a room, a member generating a portrait of a host character hits not-found there, while the caption path now reads as runAs (the host).

## Why

Room imagery is host-funded and host-owned (0509 ruling); a member's request should resolve the host's card the same way captioning does.

## Done when

Both gates read the subject card and avatar as runAs with the owner check intact; a room test where a member generates a portrait of the host's character succeeds and a stranger still gets not-found.

## Evidence

Not reachable today: chat.generateImage carries no subjectCharacterId (packages/contracts/src/imagery/index.ts generatePictureRequestSchema) and the chat op passes no subject (packages/server/src/domain/chat/verbs/generate-image.ts), so reuseGate and avatarReferenceGate return early for a member (ADR 0298). Owner direction when it becomes reachable: a host room switch, "Let members make pictures of my characters", default on; off refuses clearly instead of not-found. Applies once the picture request carries a subject.
