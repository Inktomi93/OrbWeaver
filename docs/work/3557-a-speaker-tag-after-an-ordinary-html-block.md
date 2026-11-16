---
kind: bug
status: open
updated: 2026-11-16
priority: P2
area: chat
plan: chat-html-and-presets
---

# A speaker tag after an ordinary HTML block still splits and tints

## What

The speaker parser skips tags inside every HTML block, not only blocks a reply frames or holds. A speaker tag on the line after a plain block loses its span and stays in the text.

## Why

A narrator room's status block followed by a character's line loses the tint and prints the raw tag.

## Done when

A speaker tag or label is skipped only inside a panel, a raw-text element or a code block; kit rows and a component row, red on the parent.

## Evidence

Filled at landing: what ran and where its output is.
