---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
---

# The avatar admission check refuses bytes over the asset cap, proven

## What

The asset store and the avatar check share `exceedsAssetCap` in `packages/server/src/domain/assets/substrate/cap.ts`. A test covers the store's refusal. No test covers the call in `packages/server/src/domain/assets/verbs/admits-avatar.ts`: with that call bypassed, every case still passes.

## Why

An import preview reads the avatar check to say whether art lands. If the check stops applying the cap, the preview promises art the store then refuses.

## Done when

A case builds the avatar check with a cap below the bytes and shows it refuses them, beside the store refusing the same bytes. The case fails when the avatar check skips the cap.

## Evidence

Filled at landing: what ran and where its output is.
