---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: chat
plan: import-robustness
---

# Make Sola V4 Flame Complete render end to end

## What

Sola V4 Flame Complete is the stress case for the regex system, not a preset the app supports by name. It is public, large and widely used, and its file carries a couple of hundred display and prompt scripts, so it stands in for the class of heavy SillyTavern regex presets. After the bundled-regex import, the stage rule for imported scripts, the regex guards and the styled-reply frame land, import the file through the product and drive a chat with it. The check is on our regex handling: every script lands in the pass its flags name, with its depth pair kept; no script is refused or stopped by a guard in normal use; a turn's regex work stays inside its deadline and budget; a reply the scripts style renders in its frame and streams without showing markup. Nothing in the product is fitted to this file: no selector, name, special case or seed exists for it.

## Why

The owner's regex scripts and presets of this kind must work through the general system. A preset this size finds what a small fixture cannot: a guard that fires on common use, a pass that drops a depth bound, a frame that cannot hold the output.

## Done when

A rendered check imports the file through the product, runs turns, and records: scripts imported and where each landed, none refused or stopped, the time and budget a turn's regex work used, and a styled reply framed and streamed cleanly. Each failure found is fixed in the general system or filed as an item. A search of the product source finds no reference to the preset.

## Evidence

Filled at landing: what ran and where its output is.
