---
kind: work
status: doing
updated: 2026-11-07
priority: P2
area: testing
lane: wt/agent-af0eb63da78e0d44e
plan: test-foundation
---

# Correlate the instant-typing test send witness to a new user message

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`MAIN-AF3-INSTANTSEND-001`: Preserve raw typing/focus proof and replace the final fixed-substring reused-row observation with a same-room new committed user-message witness under explicit send semantics.

Inspect `tests/e2e/live-composer-instant-type.spec.ts`, `tests/e2e/support/chat-room.ts`, `tests/e2e/support/global-setup.ts`, `packages/client/src/features/chat/hooks/use-chat-behavior-prefs.ts`.

## Why

`MAIN-AF3-INSTANTSEND-001`: An existing matching message can satisfy the assertion when plain Enter inserts a newline under the current preference.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`MAIN-AF3-INSTANTSEND-001`: A retained matching row with no new send fails; a successful one-shot send creates a new exact-content row. Scoped native qualification remains owed.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
