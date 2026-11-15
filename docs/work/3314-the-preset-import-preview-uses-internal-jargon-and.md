---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: presets
---

# The preset import preview uses internal jargon and does not say the display scripts were left out

## What

Importing a SillyTavern preset lists left-out fields with notes such as "no orb seat", "newChatMarker is room-agnostic" and "room-owned". The field that holds the preset's display scripts reads only as "not a field orb recognises".

## Why

The user cannot tell from the preview that the preset's whole look will be missing, and the wording is meaningless to them.

## Done when

The preview names left-out fields in plain words. When the file carries display scripts that will not be imported, it says so on its own line with the count.

## Evidence

Filled at landing: what ran and where its output is.
