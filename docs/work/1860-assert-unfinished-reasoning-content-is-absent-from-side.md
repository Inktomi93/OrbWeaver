---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: testing
plan: restoration-register
---

# Assert unfinished reasoning content is absent from side-generation prose

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-FSEC-Q0004`: Assert the expected empty summary or absence of a unique reasoning phrase in the unfinished-tag output-cap case. Preserve clean-prose controls.

Inspect `tests/inference/roles/side-gen.int.test.ts`, `packages/inference/src/roles/side-gen.ts`, `packages/inference/src/backends/openai-compat/think-tags.ts`, `packages/inference/src/backends/openai-compat/model.ts`.

## Why

`AF3-FSEC-Q0004`: Removing the opening tag alone satisfies the negative assertion while leaving reasoning content in the output.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-FSEC-Q0004`: An opening-tag-only removal fails. Valid prose and structured JSON containing literal tags retain their intended behavior.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
