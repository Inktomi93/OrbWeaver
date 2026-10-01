---
kind: bug
status: doing
updated: 2026-10-01
priority: P3
area: inference
lane: codex/alpha-launch-proof
---

# Let local-light query embeds run ahead of indexer embeds

## What

Local-light runs every task on one worker thread in arrival order, so a search query embed issued during a sign-up seed waits behind the seed's card embeds: 8 s and 26 s in two measured runs.

## Why

A new user's first search right after sign-up stalls for seconds.

## Done when

Interactive query embeds take priority over indexer embeds, and a query embed during a sign-up seed returns in under 500 ms on a measured run.

## Evidence

Query embeddings now precede queued indexing batches while one native call remains active. A composed regression proves ordering and preserved results.

The real q8 worker measurement uses CPU affinity of two and production seed-card text. A warm query takes about 55 ms. A query submitted during an active card batch takes about 10.47 seconds, then runs before the remaining cards. Evidence: `reports/alpha-product-completion/query-priority-proof.json`.

The 500 ms requirement remains unmet during active indexing. The shipped seed vectors avoid live indexing at signup. Interrupting native inference or loading a separate query worker requires a resource decision. Shared static acceptance remains pending.
