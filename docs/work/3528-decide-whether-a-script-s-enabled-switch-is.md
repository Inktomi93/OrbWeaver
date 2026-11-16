---
kind: decision
status: open
updated: 2026-11-16
priority: P3
area: import
plan: chat-html-and-presets
---

# Decide whether a script's enabled switch is part of a preset's import identity

## What

`packages/contracts/src/regex/schemas.ts` leaves a script's enabled switch out of its content key. Two SillyTavern preset variants that differ only in which scripts are switched off import as one preset, and the second variant is lost.

## Why

One library row holds one switch, so the variants cannot both land as the model stands.

## Done when

A ruling is recorded: keep it and say so in the import preview, or give each preset its own switch per attachment so both variants land.

## Evidence

Filled at landing: what ran and where its output is.
