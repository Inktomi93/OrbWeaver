---
kind: work
status: open
updated: 2026-10-23
priority: P3
area: server
---

# Debug info diagnostics read the compose capture and trace decisions

## What

`/api/_debug/info` reports `wireCapture` and `rpgTrace` from `env.WIRE_CAPTURE` and `env.RPG_TRACE` (`packages/server/src/foundation/env/index.ts`), while the wire routes and the bug report now publish the compose decision. A root built with `wireCapture: true` or `rpgTrace: true` disagrees with itself across these reads.

## Why

One decision, one read; an operator probe that contradicts the routes beside it is a lying instrument.

## Done when

A root built with `wireCapture: true` and `rpgTrace: true` reports both as on in `/api/_debug/info`, asserted in `tests/server/entry/debug-gate-admission.int.test.ts`.

## Evidence

Filled at landing: what ran and where its output is.
