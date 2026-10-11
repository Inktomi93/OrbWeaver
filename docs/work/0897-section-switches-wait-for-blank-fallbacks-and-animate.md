---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: client
---

# Section switches wait for blank fallbacks and animate the skeleton reveal

## What

packages/client/src/lib/view-transition.ts destinationSettled waits for data-slot=skeleton to clear, but a blank fallback with no skeleton (the Presets welcome-to-Default pane) is not waited for, and the skeleton-to-content reveal after a crossfade is a hard pop. Wait on a destination-ready signal that covers blank fallbacks, and fade the reveal with the section motion tokens, honouring reduced motion.

## Why

Side-eye on 866 found first visits fade onto an empty or skeleton pane and then pop; the 866 lane fixed the readiness gate but not these two cases.

## Done when

First visits to Presets, Chats, Characters and Refinery on owner data crossfade straight to content or fade the reveal; a CT pins the blank-fallback wait; reduced motion stays instant.

## Evidence

Filled at landing: what ran and where its output is.
