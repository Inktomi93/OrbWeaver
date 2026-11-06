---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: tooling
plan: test-foundation
---

# Remove the always-failing Windows branch from stack no-op assertion

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-TSSEC-Q0004`: Assert the private leader record is absent directly, or document and express any genuine platform-specific condition outside the negated OR.

Inspect `tests/tooling/stack/index.int.test.ts`, `tooling/src/stack/ops/run.ts`, `tooling/src/stack/ops/dev-down.ts`.

## Why

`AF3-TSSEC-Q0004`: On win32 the current OR expression is always true but the test requires false, so a correct clean no-op cannot pass the final assertion.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-TSSEC-Q0004`: The existing native down/status case passes on supported Windows and Linux environments with the record absent; no new helper or fake Boolean test.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
