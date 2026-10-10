---
kind: bug
status: doing
updated: 2026-10-10
lane: fix/bounded-jina-text
---

# Bound memory during local embedding and reranking

## What

Long text embedding exceeds the container memory limit during background indexing. Measure native model loading, embedding and reranking separately.

## Why

Memory pressure delays collection reads and kills the process even though the imported collection is modest and the JavaScript heap remains small.

## Done when

Bound native inference with the deployed cached models. Reserve server CPU headroom through the local model worker's native thread budget. Preserve projected text, result order, vector bindings and user data. Verify repeated embedding and reranking together, generation changes, analysis retention and responsive collection reads.

## Evidence

Production runs `6ce73829e43b906e88b4dbcfaed229f2205c1db9`, including the reviewed memory repair and native worker CPU budget.

Bounded native text and image inference passed repeated cached-model probes with embedding and reranking loaded together. The packaged application passed isolated indexing with an eight GiB memory limit and swap disabled. Users, encrypted credentials and source data remained unchanged.

Completed evidence:

```text
Combined integration tests:
.claude/worktrees/local-model-memory-integration/reports/runs/test/local-model-memory-integration-3524448-2026-10-10T08-19-01-166Z/test-report.json
Application structure:
.claude/worktrees/local-model-memory-integration/reports/runs/structure/local-model-memory-integration-3528500-2026-10-10T08-20-36-874Z/check-structure.json
Packaged application observation:
/tmp/orb-packaged-memory-9dgs_2zn/observation.jsonl
Verified image:
inktomi/orbweaver:memory-fix-f0d3a735ab
sha256:afad1ba8709eaa9581c2263c6f3dbb1c715a7480490a5468c0a886a126f8f6e7
```

Authenticated collection responsiveness remains unverified. Verify real tab loads after authorized restart before landing this item.
