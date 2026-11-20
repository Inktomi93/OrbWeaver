---
kind: tooling
status: open
updated: 2026-11-13
priority: P3
area: tooling
plan: checked-law
---

# The snap CLI reads the stack tool's constants without loading its commands

## What

`tooling/src/snap/index.ts` imports `tooling/src/stack/index.ts` for a few constants (port and fixture env names, CLI paths, fixture credentials). That door also loads the dev-up command and the verdicts module, which pull the server network adapter and a log formatter, a measured cost of seconds on every snap start under load.

## Why

Every real snap CLI start pays for commands it never runs.

## Done when

The stack tool's index stays its one door, keeps its constants static and loads its heavy commands on use; a profile of a snap start shows the cost gone; no dependency rule exception is added.

## Evidence

Filled at landing: what ran and where its output is.
