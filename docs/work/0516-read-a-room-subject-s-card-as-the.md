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

Filled at landing: what ran and where its output is.
