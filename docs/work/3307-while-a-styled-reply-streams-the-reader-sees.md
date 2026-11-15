---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: chat
---

# While a styled reply streams, the reader sees the preset's raw protocol and its hidden spoilers

## What

During every styled turn, the streaming row shows the model's raw preset markup: tag names followed by a \[blocked] marker, stray closing tags, the HUD tag with its digest, and the full planning and QA blocks. The settled frame hides those blocks behind a director spoilers toggle. This lasts 20 to 30 seconds per turn on both providers, in bubble and flat, on desktop and phone. Then the row snaps to the styled panels.

## Why

Every styled turn spoils the preset's own surprise and looks broken for half a minute, so a first user of a styled preset thinks the import failed.

## Done when

A streaming styled reply never shows tag text, \[blocked] markers or blocks its display scripts hide. It shows its prose without the protocol, or a sized placeholder until the frame lands. A CT streams a styled reply into the ghost row and asserts that its text content holds no tag text and no \[blocked], and that test fails on the current ghost.

## Evidence

Filled at landing: what ran and where its output is.
