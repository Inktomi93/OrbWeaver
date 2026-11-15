---
kind: decision
status: open
updated: 2026-11-15
priority: P1
area: security
plan: import-robustness
---

# Decide whether a display script's own script blocks run inside a reply frame

## What

A styled reply uses the same frame as an interactive card. A script block that a preset's display script writes into a reply runs inside that frame when the admin allows interactive cards, the character's trust resolves to interactive and the viewer's story-card scripts setting is on, which is its default. Inline handlers are stripped. The frame has an opaque origin and no network access. The owner expected a styled reply to be inert.

## Why

An imported preset's display scripts are third-party code, and nobody chose to run their scripts; the trust setting was written for a character's own cards.

## Done when

A recorded ruling says whether a reply frame always serves the static posture or follows the card trust tier, D354 states it, and a case with a display script that emits a script block pins the ruled behaviour.

## Evidence

Filled at landing: what ran and where its output is.
