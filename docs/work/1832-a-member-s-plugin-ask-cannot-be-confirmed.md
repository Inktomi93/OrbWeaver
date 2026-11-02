---
kind: bug
status: open
updated: 2026-11-02
priority: P3
area: plugin
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

## Owner ruling (2026-11-02)

The host's yes is the authority. A member-installed plugin's ask confirms when the plugin is still installed and enabled and its installer is still in the room; the installer no longer needs to hold host. This is an owner exception to the rule in `packages/server/src/domain/automation/verbs/confirm-suggestion.ts` that the confirmer's host role never stands in for the actor's, and it applies to the plugin origin only; the rule origin stays as it is. An installer who held host and was demoted is now a member and is covered (claude-b's reading, put to the owner). Route to security-executor. Done: a law or ADR line, and a test that drives a member ask through confirm.
