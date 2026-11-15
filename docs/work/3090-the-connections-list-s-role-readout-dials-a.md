---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: connection
---

# The connections list's role readout dials a newly added row

## What

`bindingReadout` in `packages/server/src/domain/connection/verbs/bindings.ts` calls `ctx.runtime.resolve` for every routable task when the connections list reads `connection.listBindings`. That path warms the row (`warmFacts` then `warmEndpoint`, which on openai-compat ends in `probeUnprobedModel`, `packages/inference/src/index.ts`), so right after a connection is added the list refetch dials the new row, including a per-model probe that can load a local model. The plain `connection.capabilities` read on Ollama reaches `/api/show` and `/api/chat` (`capabilities-cached-read.int.test.ts`); whether the readout's `resolve` also reaches `/api/chat` is not measured.

## Why

The role readout beside the add flow can wake a local model that a no-dial read was meant to leave asleep.

## Done when

The readout resolves on held facts (or a list-only warm), and a Node case on a scripted local server counts no per-model probe from `connection.listBindings` after `connection.create`.

## Evidence

Filled at landing: what ran and where its output is.
