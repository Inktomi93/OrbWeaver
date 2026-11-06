---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: inference
plan: test-foundation
---

# Release an acquired reranker encoder when its head fails to load

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B008-finding-001`: Validate the head before native encoder acquisition, or join both acquisitions and dispose a successful encoder if head loading fails, including late encoder completion.

Inspect `tests/support/node/model-kernel.int.test.ts`, `tests/support/node/reference-head-kernel.ts`, `packages/inference/src/backends/local-light/model-cache.ts`, `packages/inference/src/backends/local-light/st-head.ts`.

## Why

`AF3-B008-finding-001`: Promise.all rejection bypasses the LoadedReranker owner and the memo discards the rejected entry without access to the acquired encoder. Existing malformed-head tests observe no forward, not cleanup.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B008-finding-001`: Affected native model-kernel tests pass with a successful-acquisition/disposal witness on head failure, including deferred acquisition. No claim of measured native memory retention is required to fix deterministic ownership.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
