---
kind: bug
status: blocked
updated: 2026-10-21
priority: P2
blocked: owner
---

# server-factory tier rule refuses brand narrowings that name no server shape

## What

After 1099, narrowedTo refuses every narrowed intersection part outside the declared type that is not primitive. Narrowing a string to string & {readonly \_\_b: 1}, kit's Branded, or in-narrowing an object to object & Record<'close', unknown> now refuses though no server shape is involved. Fail-closed; no live instance.

## Why

A blocking false refusal would turn a legitimate kit-brand type guard in a factory tier red for nothing.

## Done when

A narrowed part passes when it has no declaration in a server factory tier (anonymous, lib, kit or contracts); the brand and object cases are clean, the intersection-leak rows still refuse, with red-first rows.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
