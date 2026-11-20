---
kind: work
status: doing
updated: 2026-11-20
priority: P2
area: chat
lane: wt/agent-a9a68adbff0236b8e
plan: chat-html-and-presets
---

# Character trust is one control and one notice

## What

Owner ruling: everything that decides whether a character content loads is part of character trust, external media included. The Trust tab presents the HTML ladder (Plain text, Rich HTML, Interactive, Inherit) and the load-internet-media switch as one Character trust block, and the install defaults read the same way. On a message, the separate plain fallback, held media and held script notices become one notice that lists everything held back and offers one action opening the control that decides it. The stored axes stay separate: what content may do, and what it may fetch.

## Why

Separate controls and three different warnings for one question confuse people about why something did not load.

## Done when

One Character trust block on the Trust tab and in the install defaults; one notice per row listing every held-back kind with one action; law UI-Theming-and-Content §12 and the plan updated; component tests cover each held-back combination; Sola and both Freaky Frankenstein presets still draw.

## Evidence

Filled at landing: what ran and where its output is.
