---
kind: bug
status: blocked
updated: 2026-11-02
priority: P3
area: plugin
blocked: owner
---

# A member's plugin ask cannot be confirmed: the liveness check requires the installer to hold host

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.
1. Member plugin asks cannot be confirmed. `assertPluginStillLive` in `packages/server/src/domain/automation/verbs/confirm-suggestion.ts` requires the installer to hold host, but `canWrite: false` means a member doesn't, so POSTURE 2 raises cards that always fail with `SuggestionRefusedError`. Fails closed, product defect. Blocked: owner ruling on what a member's ask means. Done: a test drives a member ask through confirm.
