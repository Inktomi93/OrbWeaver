---
kind: bug
status: open
updated: 2026-11-27
priority: P3
area: import
plan: unwired-code
---

# A standalone world file names each entry field it drops

## What

parseWorldBookFile reads entries through loreEntryColumns with no note channel, because PortableParse carries no notes, so a malformed field in a standalone world file drops silently while the same drop in a card book is named.

## Why

The person cannot tell which part of the world file was lost.

## Done when

The world-file import names each dropped entry field the way the card import does, with a test through the import door.

## Evidence

Filled at landing: what ran and where its output is.
