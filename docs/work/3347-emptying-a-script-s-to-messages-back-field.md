---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: regex
plan: import-robustness
---

# Emptying a script's To (messages back) field saves

## What

Clearing the To (messages back) field in the script editor does not save, so a script given a depth limit cannot go back to covering the whole chat.

## Why

The only way back is to delete and recreate the script.

## Done when

A CT clears the field on a script that has a maximum depth, saves, and reads the script back with no maximum.

## Evidence

Filled at landing: what ran and where its output is.
