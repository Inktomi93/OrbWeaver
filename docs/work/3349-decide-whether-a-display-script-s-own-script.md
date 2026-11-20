---
kind: decision
status: doing
updated: 2026-11-20
priority: P2
area: security
lane: wt/agent-a8c72080671572f19
plan: import-robustness
---

# Decide whether a display script's own script blocks run inside a reply frame

## What

A styled reply uses the same frame as an interactive card, under the same three gates: the admin ceiling, the character's trust and the viewer's story-card scripts setting. A script block that a preset's display script writes into a reply runs inside it when all three allow. The owner's position is that this is the existing interactive card behaviour and stays. One fact is unchecked: the gate reads the character's trust while the script text comes from the preset, so trusting a character may let any preset's scripts run on that character's replies, in each member's browser in a shared room.

## Why

The behaviour is intended; what is missing is the written rule and a check that a reply frame reaches nothing a card frame does not.

## Done when

D354 states that a reply frame follows the card trust tier and names what the gate keys on. A case shows a reply frame's policy equals the card frame's. The owner has been told, in plain words, whose trust setting lets a preset's script run and for whom in a shared room.

## Evidence

Filled at landing: what ran and where its output is.
