---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: security
plan: authorization-and-visibility
---

# A memory trigger does not probe a disabled owner's encoder

## What

From the boot stale-space trigger or the repoint trigger, `vacuousMemoryReceipt` can send one width-check embed to a disabled owner's encoder and purge their old vectors, once per target move.

## Why

A disabled account must not spend on its connections, and its stored vectors should wait for re-enable.

## Done when

The trigger skips a disabled owner, with a test that finds no encoder call and the old vectors still stored.

## Evidence

Filled at landing: what ran and where its output is.
