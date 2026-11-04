---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: testing
plan: restoration-register
---

# Pin owner-derived metadata at the actual Anthropic wire boundary

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-FSEC-Q0005`: Check raw owner ID exclusion, digest format and independently established owner linkage at the Anthropic request boundary.

Inspect `tests/inference/roles/side-gen.int.test.ts`, `packages/inference/src/backends/anthropic-messages/extras.ts`, `packages/inference/src/roles/side-gen.ts`.

## Why

`AF3-FSEC-Q0005`: An arbitrary string assertion accepts a raw owner ID or a constant despite the producer digest contract.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-FSEC-Q0005`: Raw-ID and constant substitutions fail. Known vectors or distinct real owners establish derivation. Preserve the geography assertion and public hash-domain semantics.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
