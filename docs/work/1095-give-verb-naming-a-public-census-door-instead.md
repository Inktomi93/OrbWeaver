---
kind: tooling
status: open
updated: 2026-10-19
priority: P3
---

# Give verb-naming a public census door instead of a raw server reach

## What

The verb-naming gate stays custom. A runtime successor must read every domain verb file, but @orb/server exposes only the domain barrels, so a test reaches the verbs either through a raw #server import (granted per file by tests-raw-package-reach) or a computed import that launders the same reach past that gate.

## Why

Item 1041 moves gate claims to native checks; this one needs a sanctioned census door first, or the move weakens tests-raw-package-reach.

## Done when

A testkit or server census door lists the verb modules; a node suite judges verb naming through it with a planted defect red first; the gate module is deleted.

## Evidence

Filled at landing: what ran and where its output is.
