---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: security
---

# The plugin membrane's deadline, result cap and in-flight cap have no test

## What

packages/server/src/infra/plugin-host/membrane.ts bounds a guest call by a deadline, caps the size of a result and caps the calls in flight. The capability gate, the handle checks and the argument budget now each have a real-guest test; these three bounds have none.

## Why

They are what stops a plugin from holding a turn open or exhausting the host, and a bound with no test can be widened or dropped without notice.

## Done when

A real-guest test for each bound shows the documented refusal at the limit and success just under it, reading the limits from production, each red when its bound is removed.

## Evidence

Filled at landing: what ran and where its output is.
