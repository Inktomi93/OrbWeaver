---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: cross-surface-consistency
---

# The face strip's overflow tile name does not hold its visible text

## What

Axe `label-content-name-mismatch` fails on the folded face strip's overflow tile on Chat (`data-face-overflow`, accessible name "+N More, Filter by another character") at chat-empty-search and every chat-list and room checkpoint that shows the strip. The name is built in `tileName` (`packages/client/src/components/face-strip-fold.ts`) and the visible text is a swatch count and a "More" caption in separate flex items (`packages/client/src/components/face-strip.tsx`). The same rule fires once on the participant chip named "Charlotte: character" at generation-visible-held-stream. Neither control is a list row, shelf face or described menu item, so the recorded name-and-description ruling does not cover them.

## Why

A voice-control user says the visible text to press a control; if the visible text does not match the name, the command does not resolve. The strip's own component test checks avatar initials only.

## Done when

A native axe scan of the tile, with and without the caption, shows no `label-content-name-mismatch` (fix the run-together text if that is the cause, as for the chat title), or the finding is answered with a cited reason; the chip is resolved the same way; a component test holds both.

## Evidence

Filled at landing: what ran and where its output is.
