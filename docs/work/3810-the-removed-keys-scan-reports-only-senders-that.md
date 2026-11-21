---
kind: tooling
status: doing
updated: 2026-11-21
priority: P3
area: tooling
lane: wt/agent-ae9a459eaef758c98
plan: unwired-code
---

# The removed-keys scan reports only senders that write the removed wire key

## What

pnpm unwired removed-keys --base=origin/main finds 30 keys removed since the last push and fails on 7 live senders that are all name matches on other shapes: maxRetries on the client event source class (packages/client/src/data/bus/post-event-source.ts), TanStack table pageSize (packages/client/src/features/tag/components/labels-suggestions.tsx) and the card-atlas plugin's request to an outside API (packages/showcase-plugins/bundles/card-atlas/main.ts). It also prints about 2,400 ambiguous hits on common names such as value and characterId.

## Why

A check that fails on every common name cannot be trusted to catch a client still sending a removed key.

## Done when

A removed key's sender is reported only when the checker resolves the written property to the removed member of the wire shape; planted-fixture tests cover a true sender, a same-named field on another type and an outside API body; the orchestrator reruns against origin/main and judges the result.

## Evidence

Filled at landing: what ran and where its output is.
