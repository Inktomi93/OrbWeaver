---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: test-foundation
---

# Cover the token and signup seat paths for the shared-room flag

## What

Only `acceptInvite` is exercised. `redeemInviteAtomic` and `redeemSignupAtomic` (`packages/server/src/domain/chat/persistence/invites.ts`) set the flag with no case.

## Why

A regression on either path reopens the host's plane to a seated member with no red.

## Done when

A case per path seats a member through `redeemInvite` and through the signup redeem, then shows the plane held.

## Evidence

Filled at landing: what ran and where its output is.
