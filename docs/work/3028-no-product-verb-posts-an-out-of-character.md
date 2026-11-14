---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# No product verb posts an out-of-character comment message

## What

The comment message kind is in the kind policy and the memory build skips it, but a search of the server source finds no writer that stamps a row with it, so no product path makes one. Tests of the skipped-row routes use hidden rows instead.

## Why

A kind with a policy row and no writer is either an unfinished feature or a dead member; nothing records which.

## Done when

The comment kind is either written by a chat verb with a case, or removed from the kind tuple with its policy row.

## Evidence

Filled at landing: what ran and where its output is.
