---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: client
---

# Streaming row derives its action footprint from the real action cluster

## What

GhostActionsFootprint in packages/client/src/features/chat/components/message-actions-row\.tsx hand-copies the settled row's inline actions (Edit, Fork, Add a reaction, the overflow menu) to reserve their width while a reply streams. It already drifted: it omits the model credit (renderGenerationCredit, generation-credit.tsx), so with showModelIcon on a short reply widens 22px at commit in bubble, echo, whisper and ripple. It also builds RowActionsMenu with a fake destructive object and a no-op onConfirm, a mock inside product code. Fix: split MessageActionsRow's inline cluster into one presentational component taking handlers and the generationCredit flag; the settled row passes real handlers, the ghost passes inert no-ops plus the same flag. Extend the parity CT in tests/client/features/chat/components/ghost-message-row\.ct.tsx to run with showModelIcon on.

## Why

Two button lists that must change together, held only by a test pinned to one settings combination, drift silently; the drift is already user-visible as a commit-time reflow.

## Done when

The ghost footprint renders from the same cluster component as the settled row, and the parity CT passes with showModelIcon both off and on, red on the hand-copied footprint.

## Evidence

Filled at landing: what ran and where its output is.
