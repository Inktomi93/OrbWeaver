---
kind: bug
status: open
updated: 2026-10-30
priority: P2
area: ui
---

# Phone tab bar labels overprint at 200% and 300% text

## What

On a phone at 200% and 300% text, the bottom tab bar labels overprint each other.

## Why

Pre-existing; side-eye found it in the shell overflow review (`reports/side-eye/2026-10-30-shell-overflow.md`).

## Done when

At 390x844 and 320 wide, at 200% and 300% text, every tab label is legible with no overlap (or the bar switches to an icon-plus-accessible-name form the law allows), pinned in the text-scale suite on Chromium and WebKit.

## Evidence

Filled at landing: what ran and where its output is.
