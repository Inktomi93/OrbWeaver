---
kind: work
status: blocked
updated: 2026-10-21
priority: P3
blocked: owner
---

# regkeys and registry-candidates unwrap transparent receiver wrappers

## What

pnpm ast regkeys and registry-candidates miss a receiver written through parentheses, as or satisfies. From the 955 version table.

## Why

A registry read through a wrapper is invisible to the two verbs that inventory registries.

## Done when

Both verbs unwrap the receiver with red-first cases and unchanged output on unwrapped receivers.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
