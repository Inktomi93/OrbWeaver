---
kind: decision
status: blocked
updated: 2026-11-11
priority: P3
area: ui
blocked: on 1401
plan: cross-surface-consistency
---

# Decide whether the regex editor wraps lines at enlarged text

## What

CodeMirror's `cm-scroller` scrolls sideways because line wrapping is off. Shows at phone 300% text on: Config independent category regex.

## Why

Reflow at enlarged text competes with code layout.

## Done when

A ruling, and either `lineWrapping` on, or a production-declared code strip the probe reads through a declared attribute. These checkpoints show no enlarged-text geometry finding at 200% and 300% text: config-regex-\*.

## Evidence

Filled at landing: what ran and where its output is.
