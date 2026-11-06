---
kind: work
status: open
updated: 2026-11-06
priority: P1
area: tooling
plan: test-foundation
---

# Require complete path identities before destructive process cleanup

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-TSSEC-Q0003`; `AF3-TSSEC-Q0008`: Correct both existing checkout argv and native stage-root ownership predicates in their own homes, preserving supported path/argument boundaries and stronger downstream guards.

Inspect `tests/tooling/stack/lib/stack-plan.test.ts`, `tests/tooling/stack/ops/dev-down.int.test.ts`, `tooling/src/stack/lib/stack-plan.ts`, `tooling/src/stack/ops/dev-down.ts`.

## Why

`AF3-TSSEC-Q0003`; `AF3-TSSEC-Q0008`: A foreign leading path prefix can pass checkout custody, and a snap-stage-backup lookalike can pass stage custody; both can reach same-user POSIX group signaling.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-TSSEC-Q0003`; `AF3-TSSEC-Q0008`: Independent pure and private-port native controls preserve foreign listeners for both path regimes while genuine owned listeners remain stoppable. Retain unknown-owner, live-holder and post-stop checks; recheck source before implementation. No current runtime reproduction claimed.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
