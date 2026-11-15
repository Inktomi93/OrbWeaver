---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
plan: typed-enforcers
---

# Declare the object mode of tooling and script schemas

## What

Widen `orb/wire-object-declares-mode` to `tooling/src` and `scripts`, and declare each bare `z.object` there: `.strip()` for a third-party tool's output or a report read back from disk, `z.strictObject` only where the same tool writes and reads the shape.

## Why

The rule now covers every package source tree; tooling and script schemas parse subprocess reports, browser protocol payloads and CI API bodies, and a bare object there still drops unknown keys with no stated intent.

## Done when

The rule runs on `tooling/src` and `scripts` with zero findings; `tests/tooling/eslint-id-boundaries.test.ts` pins the reach.

## Evidence

Filled at landing: what ran and where its output is.
