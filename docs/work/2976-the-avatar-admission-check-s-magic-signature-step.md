---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
---

# The avatar admission check's magic-signature step has a test

## What

In packages/server/src/domain/assets/verbs/admits-avatar.ts, the call to assertMagicMatches after assertKindAdmits can be removed and every server test still passes. The new cap case holds bytes the kind and magic checks both admit, so it cannot see that step.

## Why

An import preview reads this check to say whether art lands. If it stops applying the magic check, the preview promises art the store then refuses.

## Done when

A case builds the avatar check with bytes whose sniffed type and signature disagree and shows it refuses them, beside the store refusing the same bytes. The case fails when the magic step is removed from the avatar check.

## Evidence

Filled at landing: what ran and where its output is.
