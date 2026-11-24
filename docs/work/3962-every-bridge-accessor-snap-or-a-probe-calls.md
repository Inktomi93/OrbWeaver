---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-aed02bd55a57b1529
plan: unwired-code
---

# Every bridge accessor snap or a probe calls is checked against the handle type

## What

Some bridge readers are still strings outside the compiler: floor/browser/browser-diagnostics.ts, floor/appearance/appearance-matrix.ts, motion-audit/ops/trace.ts and drive.ts, snap/lib/map-browser.ts inside its DOM census, and the reset inside the motion probe's frame callback. Renaming an accessor consistently still typechecks.

## Why

The bridge is the one surface where a client rename fails only at run time, and the converted sites show the fix works.

## Done when

No tooling or test file reaches a bridge member through a string except user data (scenario JSON and eval flags); renaming each accessor named above fails the tooling typecheck; tests that plant a stub bridge still pass.

## Evidence

Filled at landing: what ran and where its output is.
