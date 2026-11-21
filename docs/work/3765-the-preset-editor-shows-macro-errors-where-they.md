---
kind: work
status: open
updated: 2026-11-21
priority: P2
area: preset
plan: chat-html-and-presets
---

# The preset editor shows macro errors where they are

## What

Macro parsing produces diagnostics with a position (MacroSpan in packages/kit/src/macro/types.ts: offset, line, col, length), and only kit and automation's renderer use them. No client code reads macro diagnostics, so a broken macro in a preset is never flagged in the preset editor.

## Why

A preset with a broken macro reaches the model with no warning to its author.

## Done when

The preset editor shows each macro diagnostic beside its section as the author types, pointing at the line and column, with CTs for an unknown macro and a bad argument.

## Evidence

Filled at landing: what ran and where its output is.
