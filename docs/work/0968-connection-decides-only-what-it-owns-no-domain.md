---
kind: work
status: doing
updated: 2026-10-15
priority: P1
lane: codex/native-config-999
plan: inference-flow
---

# Connection decides only what it owns; no domain branches on a wire

## What

domain/connection calls the runtime and contracts for API coherence, the funding verdict, the task-by-kind table and the local-light check instead of re-spelling them (kind.ts, diagnostics.ts, connections.ts). Remove wire comparisons from domain/embeddings/substrate/generation.ts and compose/search-discovery.ts in favour of a runtime capability; delete the search fallback snapshot with the untyped compat wire and type the embedding snapshot's api and wire from the contract tuples. Fix ResolveTaskParams to carry the abort signal compose already passes, and the ConnectionService.resolve comment. Rewrite Tier-3b section 3 to list what the door decides, and add a gate that a domain never compares wire or api.

## Why

Re-spelled runtime rules drift from the runtime, and Tier-3b invariant 1 forbids per-wire dispatch in a domain.

## Done when

The duplicates are deleted and call their owner; the wire gate holds with planted controls; Tier-3b section 3 matches the code.

## Evidence

Filled at landing: what ran and where its output is.
