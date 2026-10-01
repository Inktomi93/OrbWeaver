---
kind: bug
status: open
updated: 2026-10-01
priority: P3
area: inference
---

# Let local-light query embeds run ahead of indexer embeds

## What

Local-light prioritizes interactive query embeds over queued indexing batches. An active native inference call still finishes before the query runs. Measure signup and first search separately from live indexing contention.

## Why

A new user's first search right after sign-up stalls for seconds.

## Done when

Interactive query embeds take priority over indexer embeds, and a query embed during a sign-up seed returns in under 500 ms on a measured run.

## Evidence

Query embeddings now precede queued indexing batches while one native call remains active. A composed regression proves ordering and preserved results.

The real q8 worker remeasurement uses CPU affinity of two and production seed-card text. Evidence: `reports/alpha-product-completion/query-priority-remeasurement.json`. The earlier measurement remains in `reports/alpha-product-completion/query-priority-proof.json`.

Local signup took 95.5 ms. The immediate first search refused with `search_space_reindexing`; this was not a successful search. The first successful search took 2953.1 ms with an unloaded worker model. Its worker call spent 2775.8 ms before native inference and 62.2 ms in native inference. Readiness polling plus that successful request took 3757.3 ms after the initial refusal. A warm HTTP search took 80.3 ms. Signup produced no live text-embedding calls; the seed vectors supplied the library.

A standalone warm query took 199.9 ms. A query submitted during native card indexing took 10829.0 ms: 10741.0 ms queued, then 87.0 ms in native inference. It ran before the remaining cards. The cold case used cached weights and a new worker; the filesystem page cache was not cleared.

The 500 ms requirement remains unmet during active indexing. Cold first search also exceeds it. Interrupting native inference or loading a separate query worker requires a resource decision. This remeasurement changes no inference behavior. The static barrier passed at `b7f4d564d`. Its affected-instrument stage selected nothing after the push, so the behavioral measurements remain separate evidence.
