---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: tooling
plan: test-foundation
---

# Keep union construction evidence scoped to its vocabulary

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B046-538`: Retain tuple/contextual-slot association when collecting construction evidence in both unwired union engines; add unrelated same-text and shared/derived vocabulary controls to the existing planted suite.

Inspect `tests/tooling/unwired/unions.int.test.ts`, `tooling/src/unwired/unions.ts`.

## Why

`AF3-B046-538`: A global set of constructed literal text can suppress an unbuilt member of a different tuple, and the second engine shares the same attribution loss.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B046-538`: Actual scanUnions reports the unbuilt owner in a two-union shared-off fixture while clearing the genuinely built owner; valid shared/derived cases remain correctly classified. Focused native tests/typecheck remain owed.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
