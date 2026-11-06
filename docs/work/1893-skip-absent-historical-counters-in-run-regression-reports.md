---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: tooling
plan: test-foundation
---

# Skip absent historical counters in run regression reports

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B042-250`: Check nullable RESULT pair values before numeric conversion in the existing comparator. Extend native comparison/report coverage with absent-before, absent-after and explicit zero controls.

Inspect `tests/tooling/snap/ops/agent-readable-output.suite.int.test.ts`, `tooling/src/snap/lib/run-report-columns.ts`, `tooling/src/snap/ops/run-report.ts`, `tooling/src/snap/ops/run-report-index-assert.ts`.

## Why

`AF3-B042-250`: Number(null) fabricates a previous zero and produces a direct complete regression claim for an unmeasured historical counter.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B042-250`: Missing counters produce no comparison; explicit0 to1 remains a regression, with unchanged/decreasing controls. Native focused checks remain owed; no process exit behavior change intended.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
