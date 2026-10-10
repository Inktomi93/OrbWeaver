---
kind: bug
status: doing
updated: 2026-10-10
lane: fix/retain-image-analysis
---

# Preserve compatible asset analysis across vector reindexing

## What

Image indexing stores caption and facets with vector-generation rows, so replacing an encoder generation can discard reusable analysis and repeat provider calls.

## Why

The bounded text-encoding repair changes generation identity. Reindexing must rebuild vectors without repeating compatible paid analysis or reusing another account’s results.

## Done when

Retain validated analysis independently of vector lifetime through canonical owner-scoped persistence. Prove reuse across vector reindexing, invalidation on incompatible inputs, migration compatibility and cross-account isolation.

## Evidence

Reviewed implementation is `13645604d13d311efd01557a93006154fafaa94b`, combined with bounded inference in private candidate `f0d3a735abf06ee2acc69972fb8d8b8844a72124`.

Scoped tests and independent database probes cover annotation reuse, revision races, expected-owner write guards, cleanup and consumer isolation. The stopped-production clone migration preserved table cardinalities, vector bytes and foreign-key integrity. Positive annotation backfill is fixture-proven; the production clone contained no captioned rows.

Completed evidence:

```text
Retention correction tests:
.claude/worktrees/retain-image-analysis/reports/runs/test/retain-image-analysis-3489209-2026-10-10T08-12-34-806Z/test-report.json
Retention commit checks:
.claude/worktrees/retain-image-analysis/reports/runs/verify/retain-image-analysis-3507158-2026-10-10T08-16-03-568Z/verify.json
Combined integration tests:
.claude/worktrees/local-model-memory-integration/reports/runs/test/local-model-memory-integration-3524448-2026-10-10T08-19-01-166Z/test-report.json
Qualified migrated clone:
/tmp/retain-image-analysis-clone-ZUijZK/orbweaver.db
```

Landing remains pending the authenticated runtime check in [the memory repair](0821-bound-memory-during-local-embedding-and-reranking.md).
