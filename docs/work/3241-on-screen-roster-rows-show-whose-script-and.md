---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: chat
---

# On screen roster rows show whose script and which tier before the pattern

## What

regex-on-screen-group.tsx renders the subtitle as pattern then source in one truncated inline line, so the source words (This chat, From the preset, the host's) are cut off whenever the pattern is longer than a few characters, at 384px, 480px and on the phone.

## Why

The roster answers why the screen looks the way it does; the provenance is the answer and a sighted user never sees it.

## Done when

Every On screen row shows its source words in the viewport at the default context panel width and on the phone, with a long pattern.

## Evidence

Filled at landing: what ran and where its output is.
