---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: ui
---

# Measure the frame focus rule on Firefox

## What

The rule that returns keyboard focus from an interactive frame was measured in Chromium only. It learns at runtime whether the engine marks a pressed frame as active; on an engine that does not, the frame under a resting pointer is admitted for a few seconds after the reader's last input and its scripts are never stopped. Nothing ran on Gecko, and WebKit and touch were read from the code for the last change.

## Why

Firefox is a declared target. If Gecko does not mark a pressed frame, the protection there is the weaker mode and clicks into a card can bounce until the rule has learned the engine.

## Done when

The focus cases run on Gecko and WebKit with a real press, a scripted grab loop and a resting pointer, and the result is recorded in D354; a weaker mode on any engine is narrowed or accepted in a recorded ruling.

## Evidence

Filled at landing: what ran and where its output is.
