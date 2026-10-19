---
kind: bug
status: open
updated: 2026-10-19
priority: P2
area: server
---

# Model image parts from user rows need author or link proof

## What

resolve-media-ref.ts and wire-history.ts ridesAsModelMedia let any member's message send an asset to the model when the asset owner sits in the room. Neither the row author nor a message_assets link is checked.

## Why

A member who reads an asset id from a shared transcript can make the model describe another member's image.

## Done when

A user-row asset becomes a model image part only when the row author owns it or a message_assets link exists in the room, with a test where a member's quote of another member's asset does not reach the wire.

## Evidence

Filled at landing: what ran and where its output is.
