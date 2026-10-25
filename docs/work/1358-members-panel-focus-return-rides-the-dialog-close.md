---
kind: work
status: doing
updated: 2026-10-25
priority: P3
area: client
lane: closeout/rendered
---

# Members panel focus return rides the dialog close signal

## What

packages/client/src/features/chat/components/members-panel.tsx focusWithReassert runs seven 200ms passes to cover a dialog teardown.

## Why

A timer stands in for a close-complete signal; the motion and DOM law put waits on real lifecycle signals.

## Done when

Focus returns through the dialog's finalFocus or onOpenChangeComplete with no timer, and a CT proves focus lands on the right control after the dialog closes.

## Evidence

`MembersPanel` keeps the removal target in a ref and passes it through `MemberRow` to the real kick confirm's `finalFocus`. Roster readback moves focus to the surviving row; dialog teardown uses that same target. The timer sweep is removed. The row's existing focus handler updates its roving stop without an effect-state suppression.

[Members focus CT](../../tests/client/features/chat/components/members-focus.ct.tsx) opens the panel through its production banner door. It checks cancel return, runs the real kick, forwards its emitted event through the socket edge, and checks the exact neighboring character after roster readback and confirm disposal. A wrong Invite target fails the focus assertion.

[Rendered closeout](../reviews/rendered-closeout.md) records commands, artifacts and the final verification status.
