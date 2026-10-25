---
kind: work
status: open
updated: 2026-10-25
priority: P3
area: client
---

# Members panel focus return rides the dialog close signal

## What

packages/client/src/features/chat/components/members-panel.tsx focusWithReassert runs seven 200ms passes to cover a dialog teardown.

## Why

A timer stands in for a close-complete signal; the motion and DOM law put waits on real lifecycle signals.

## Done when

Focus returns through the dialog's finalFocus or onOpenChangeComplete with no timer, and a CT proves focus lands on the right control after the dialog closes.

## Evidence

Filled at landing: what ran and where its output is.
