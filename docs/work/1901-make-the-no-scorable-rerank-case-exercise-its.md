---
kind: work
status: open
updated: 2026-11-03
priority: P3
area: kit
plan: restoration-register
---

# Make the no-scorable rerank case exercise its stated result cap

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`B018-227`: Adjust the existing no-scorable rerank fixture so candidate count exceeds topN; assert the exact capped order while retaining the refusing runner.

Inspect `tests/kit/rerank/apply-rerank.test.ts`, `packages/kit/src/rerank/index.ts`.

## Why

`B018-227`: The current two-item/topN10 case passes even if the independent bypass cap is removed.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`B018-227`: Affected suite passes; removing only the early-return slice makes the corrected case fail for excess results. No new guard framework.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
