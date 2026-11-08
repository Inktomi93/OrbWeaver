---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: client
---

# Check whether a held chat refetch lands mid view transition

## What

The chat wave's held refetch does not run through runAfterViewTransition, so its rows may land during a crossfade; main lets a stale read land there too. Not yet rendered.

## Why

Rows that change mid crossfade can flicker in the transcript.

## Done when

A rendered check under the motion tooling shows whether the held refetch lands mid transition, and either it waits for the transition or the finding is closed with that evidence.

## Evidence

Filled at landing: what ran and where its output is.
