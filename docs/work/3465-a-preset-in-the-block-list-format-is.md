---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: import
---

# A preset in the block-list format is refused whole and the refusal does not say what it expected

## What

A preset file whose scripts and prompts sit in a block list with string placements and per-script depth fields is refused by the single-file preset import with a message that names only the SillyTavern chat-completion shape. Every regex script in it is lost with it. Decide whether the app imports that format, or says in the refusal which format it found and which exports it accepts.

## Why

A person who picks a large public preset gets a flat refusal for the whole file and no hint whether the file or the app is wrong.

## Done when

Either the import reads the block-list format with each script's target, passes, depth and flags carried over and a reason for each script it refuses, or the refusal names the format it found and the formats it accepts. A test feeds a small synthetic file of that shape through the import and sees the new behavior.

## Evidence

Filled at landing: what ran and where its output is.
