---
kind: work
status: open
updated: 2026-10-11
priority: P1
area: tests
---

# e2e smoke matrix drives the real app on the owner's container data

## What

Add e2e specs that boot the real stack on a copy of the owner's container db (docker cp orbweaver:/app/data/db, then the stage-db path from item 887) and walk the core flows: start a chat with a character, send and stream a reply on the scripted provider, swipe, edit, switch persona and pin, open Settings and change one setting in each group, open a shared room as a second user, import a card, open the gallery. Run each flow across all chat styles at desktop and phone widths and assert on rendered state, not on hand-declared wire shapes. Specs import production constants and derive types per Spine-Testing section 10.

## Why

Owner: tests must follow product changes without edits; peers such as SillyTavern and Marinara Engine test mostly by driving the running app, while ours lean on CT harnesses that copied the product and drifted.

## Done when

The smoke specs pass on the owner data copy at desktop and phone width for every chat style; a planted product change (a renamed menu item, a removed home tile) turns the matching spec red; the suite runs in a named pnpm script and is documented in Spine-Testing section 1.

## Evidence

Filled at landing: what ran and where its output is.
