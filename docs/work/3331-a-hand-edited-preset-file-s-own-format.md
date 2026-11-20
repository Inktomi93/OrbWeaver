---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: import
plan: import-robustness
---

# A hand-edited preset file's own-format script with a pattern that cannot compile imports switched off and named

## What

A preset file edited by hand can carry a script in this app's own spelling whose pattern does not compile. It is stored enabled and the import result does not name it. A SillyTavern-format script with the same fault is stored switched off and named.

## Why

Both formats pass through one write, and the result should say the same thing for the same fault.

## Done when

A case imports a preset file whose own-format script has a pattern that cannot compile, and reads it back switched off and named in the result.

## Evidence

Filled at landing: what ran and where its output is.
