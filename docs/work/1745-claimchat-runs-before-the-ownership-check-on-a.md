---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: security
plan: authorization-and-visibility
---

# claimChat runs before the ownership check on a refused send

## What

Move the claimChat call in commitUserTurn after the attachment and persona ownership checks, so a refused send leaves the room unclaimed.

## Why

packages/server/src/domain/chat/verbs/turn.ts claims the chat right after the membership gate and before assertAttachmentsOwned and assertPersonaOwnedIfExplicit. Claiming is one-way and publishes the room to every member, so a refused send has already done it.

## Done when

A test sends with an attachment or persona the caller does not own and sees the refusal. The room is still unclaimed afterwards, and a valid send still claims it before the row is written.

## Evidence

Filled at landing: what ran and where its output is.
