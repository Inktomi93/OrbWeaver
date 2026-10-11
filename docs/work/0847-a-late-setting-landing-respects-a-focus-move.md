---
kind: bug
status: open
updated: 2026-10-11
priority: P3
area: client
---

# A late setting landing respects a focus move made without input events

## What

config-content-surface.tsx now treats 'the reader moved on' as a pointerdown or keydown after the request. A focus move with no such event (assistive-technology focus, dictation, programmatic focus then insertText) is overridden by a late landing within ANCHOR_WAIT_MS. Main's activeElement rule handled that case but broke the shell-door rescue (ct:637).

## Why

Accessibility: a reader using assistive technology can lose their place.

## Done when

Both the shell-door rescue CT and a focus-then-insertText CT pass.

## Evidence

Filled at landing: what ran and where its output is.
