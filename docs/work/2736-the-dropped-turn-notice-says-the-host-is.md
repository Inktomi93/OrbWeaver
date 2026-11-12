---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: authorization-and-visibility
---

# The dropped-turn notice says the host is unavailable

## What

A queued turn dropped for consent renders the text for a host who has not allowed it, in `packages/client/src/features/notifications/components/notification-inbox-row.tsx`. That is wrong when the host's account is disabled or gone. A send refused for the same reason shows the generic send failure and keeps the draft.

## Why

The member reads that the host refused them when the host is only unavailable.

## Done when

The notice and the refused send say the host is unavailable, without saying the account is disabled, from a production copy module.

## Evidence

Filled at landing: what ran and where its output is.
