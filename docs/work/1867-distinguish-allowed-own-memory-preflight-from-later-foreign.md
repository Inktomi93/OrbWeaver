---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: testing
plan: restoration-register
---

# Distinguish allowed own-memory preflight from later foreign refusal

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-FSEC-Q0006`: Identify the offending chat in mixed-owner refusals and retain a same-wiring own-chat positive using canonical records or a real storage delegate.

Inspect `tests/server/domain/embeddings/verbs/memory-ops.int.test.ts`, `packages/server/src/domain/embeddings/verbs/memory-ops.ts`, `tests/support/node/cross-feature.ts`, `packages/server/src/domain/chat/persistence/reactions.ts`.

## Why

`AF3-FSEC-Q0006`: A broken own-host lookup can fail before the foreign chat is reached and still satisfy the common refusal assertion.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-FSEC-Q0006`: A broken early own lookup fails the test. Foreign and departed refusals preserve the no-write outcome. Do not infer vector transaction atomicity from an isolated sink.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
