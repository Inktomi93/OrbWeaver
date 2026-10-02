---
kind: bug
status: blocked
updated: 2026-10-02
priority: P3
area: inference
blocked: owner
---

# Let local-light query embeds run ahead of indexer embeds

## What

Local-light prioritizes interactive query embeds over queued indexing batches. An active native inference call still finishes before the query runs. Measure signup and first search separately from live indexing contention.

## Why

A new user's first search right after sign-up stalls for seconds.

## Done when

Interactive query embeds take priority over indexer embeds, and a query embed during a sign-up seed returns in under 500 ms on a measured run.

## Evidence

Query embeddings precede queued indexing batches while an active native call still finishes first. A composed regression proves ordering and preserved results.

The paired measurement uses the same frozen source, cached q8 jina-clip-v2 weights, production seed-card text and logical CPU 2. Each scenario runs in a fresh process. Native timestamps confirm that the query was submitted during an active indexing call. The dedicated query also completed before that indexing call finished.

| Measured value | Shared worker | Dedicated query worker |
| - | - | - |
| Warm query embed | 54.1 ms | 316.9 ms |
| Query embed during active indexing | 10231.9 ms | 110.1 ms |
| Active-query scheduler wait | 10178.7 ms | 0.058 ms |
| First query, new worker and cached weights | 2438.4 ms | 2301.6 ms |
| Steady process RSS | 1.84 GiB | 4.26 GiB |
| Peak process RSS | 2.90 GiB | 5.61 GiB |

The measured extra footprint is 2.42 GiB steady and 2.71 GiB peak. RSS includes worker and native memory; JavaScript heap values describe only the host isolate. Cold timings are not disk-cold comparisons because the filesystem page cache was not cleared. These observations are not a tail-latency guarantee or a complete HTTP search measurement.

Evidence: `reports/alpha-product-completion/query-worker-shared.json`, `reports/alpha-product-completion/query-worker-dedicated.json` and `reports/alpha-product-completion/query-worker-comparison.json`.

The separate signup and first-search evidence remains in `reports/alpha-product-completion/query-priority-remeasurement.json`. Signup took 95.5 ms and used packaged vectors rather than live seed embeddings. Immediate first search refused with search_space_reindexing; the first successful search took 2953.1 ms with an unloaded model. Readiness polling plus that request took 3757.3 ms; warm HTTP search took 80.3 ms.

The shipped shared worker still misses the 500 ms requirement during active indexing, and cold first search remains slow. The owner explicitly keeps the dedicated query worker and warmup work parked for this launch. The measured memory increase is not approved. Measurement changes no production inference behavior and does not establish integrated signup or first-search acceptance. Active ONNX inference must finish cooperatively; interruption is not an accepted remedy.
