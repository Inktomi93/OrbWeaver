---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: testing
plan: restoration-register
---

# Make the rerank foreign sentinel explicit for character results

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-FSEC-Q0007`: Give any claimed foreign-character exclusion a real foreign character and an own-character positive. Otherwise narrow the claim to the document checks.

Inspect `tests/server/domain/search/verbs/rerank-consumers.suite.int.test.ts`, `packages/server/src/domain/search/persistence/nearest.ts`, `packages/server/src/domain/search/persistence/cards.ts`, `packages/server/src/domain/search/verbs/fields.ts`.

## Why

`AF3-FSEC-Q0007`: The sentinel identifies foreign documents, while unknown character IDs are classified as other and can escape the claimed exclusion.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-FSEC-Q0007`: Preserve rerank order and the foreign-document positive. A claimed character exclusion checks the actual foreign identity. No current leak is presumed.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
