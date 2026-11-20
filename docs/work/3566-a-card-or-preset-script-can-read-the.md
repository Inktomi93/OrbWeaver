---
kind: work
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: chat-html-and-presets
---

# A card or preset script can read the reader's name without the name being code

## What

A name macro inside a script body or an event-handler attribute stays literal, so a card's own code cannot greet the reader by name.

## Why

Filling a name into code makes the name part of the program, and a member picks their own persona name.

## Done when

The frame hands the reader's and the character's names to scripts as data, such as an attribute on the frame root, with a test that a hostile name read that way stays a string.

## Evidence

Filled at landing: what ran and where its output is.
