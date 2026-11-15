---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# A warning toast follows every reply to list the settings the model ignored

## What

After almost every turn a toast says the reply ran without several things you asked for, listing sampling knobs the model does not offer. The preset's Params panel already says this once. On Gemini the toast also says reasoning was turned on for the reply when no reasoning was shown. On phone the toast covers the row header.

## Why

A warning on every reply is noise that trains people to ignore warnings, and here it repeats a fact with another home and in one case contradicts what the reader saw.

## Done when

The notice shows once per preset and connection pair, with a door to Params, and stays quiet until the pair changes. Its reasoning wording matches what actually happened on the turn.

## Evidence

Filled at landing: what ran and where its output is.
