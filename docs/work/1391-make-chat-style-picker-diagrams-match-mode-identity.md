---
kind: bug
status: open
updated: 2026-10-27
priority: P3
area: client
---

# Make chat-style picker diagrams match mode identity behavior

## What

Correct the Document option diagram, which draws avatars and name-like bars although the production Document mode intentionally omits identity.

## Why

A decorative preview may simplify typography, but it must not advertise the opposite structural behavior of the selected mode.

## Done when

Verify the real appearance picker against the production mode metadata and rendered Document treatment. Remove false identity cues from the diagram; do not add identities to Document or maintain a second mode contract.

## Evidence

Filled at landing: what ran and where its output is.
