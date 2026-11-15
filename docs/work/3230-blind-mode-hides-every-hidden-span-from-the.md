---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: rpg
---

# Blind mode hides every hidden span from the host

## What

With the reveal setting off the reveal verb returns nothing, but the tracker view and the journal reportedly still hand the host raw hidden spans. Reported, not traced: read each host surface with the setting off.

## Why

A host who turned reveal off to avoid spoilers still reads the secret.

## Done when

A test reads each host surface with the setting off and finds no hidden span.

## Evidence

Filled at landing: what ran and where its output is.
