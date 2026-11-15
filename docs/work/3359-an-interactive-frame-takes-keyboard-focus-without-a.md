---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: security
plan: import-robustness
---

# An interactive frame takes keyboard focus without a click and reads what the reader types

## What

A sandboxed card or reply frame whose script calls focus receives the reader's keystrokes with no gesture on the frame. This is true of interactive cards on main today. A reply frame that is still loading does it while invisible.

## Why

Text meant for the composer goes to third-party script, which can send it out over the frame's WebRTC residual.

## Done when

Focus that enters a frame without a click on that frame or a Tab from the host returns to where it was. A CT types after a scripted focus and shows the frame received nothing, for a card frame, a drawn reply frame and a loading reply frame. D354 and D294 state the rule. The owner has ruled on a card that focuses its own input on load.

## Evidence

Filled at landing: what ran and where its output is.
