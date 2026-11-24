---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-aaf6aadf0c94b6f15
plan: unwired-code
---

# Unwired route and request readers name their homes by symbol and refuse foreign origins

## What

Three small reader gaps from the judged-list review: the debug registrar is found by a path prefix (ROUTE_HOMES in tooling/src/unwired/graph/procedures.ts), so moving registerDebug drops its routes with no signal; OWN_ROUTE in tooling/src/unwired/graph/removed-keys.ts treats a protocol-relative URL such as //evil.example/x as our own origin; REQUEST_CALLS.Request in tooling/src/unwired/graph/urls.ts declares a body slot removed-keys never reaches.

## Why

A route home that moves silently leaves the inventory, and a foreign origin read as ours fails a branch falsely.

## Done when

The debug home is found from the registrar's symbol and a moved registrar fails a test, a protocol-relative URL is foreign with a planted case, and the Request body slot is read or removed.

## Evidence

Filled at landing: what ran and where its output is.
