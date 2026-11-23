---
kind: bug
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# A floor probe's aliased bridge read counts as a product read

## What

tooling/src/unwired/graph/build.ts throughDoor credits a bridge read from any file only when the receiver chain ends at the global bridge name; a read through a local alias counts only from a product reader, and state.ts productReader covers production and tooling/src/snap but not tooling/src/floor/instrument, which snap drives. The 3788 branch inlined the global in floor/instrument/nav.ts to get its nav members credited.

## Why

Code should not be reshaped to fit the scanner; a floor probe snap runs reads the app the way snap does.

## Done when

The graph credits an aliased bridge read in a floor instrument snap calls, a planted alias case is red without the change, and nav.ts can read through a local alias again without its members turning test-only.

## Evidence

Filled at landing: what ran and where its output is.
