---
kind: decision
status: open
updated: 2026-11-15
priority: P3
area: import
plan: import-robustness
---

# A restore does not switch off an own-format script only because it reaches no text

## What

The rule that switches off an imported script whose passes read none of its targets also applies to a script in this app's own spelling during a backup restore, so a restore can change a script the owner had enabled.

## Why

A restore should return what was backed up; the switch-off rule exists for SillyTavern files, where such a script never ran.

## Done when

A recorded ruling says whether a restore applies the rule to own-format scripts, and a case pins the ruled behaviour.

## Evidence

Filled at landing: what ran and where its output is.
