---
kind: work
status: open
updated: 2026-11-15
priority: P3
---

# Quick clicks from one frame into another under a loaded main thread can stop a legitimate card

## What

A move from one frame straight into another is read on the next animation frame. On a busy main thread (long tasks during a stream) a reader's press can be released before that check, so the entry is refused. Three such refusals within FRAME_FOCUS_GRAB_GAP_MS of each other would read as a grab loop and stop the card's scripts. Not probed.

## Why

The stop must never fire on a reader's own navigation (D294).

## Done when

A CT under a scripted main-thread load clicks between two cards at a human pace and the cards keep their scripts, or the gate reads frame-to-frame presses without the animation-frame delay.

## Evidence

Filled at landing: what ran and where its output is.
