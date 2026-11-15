---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: tooling
---

# The seed multi-user op shares the stage tRPC helper

## What

tooling/src/seed/ops/multi-user.ts keeps its own non-batched tRPC fetch, a third copy of the call that tooling/src/floor/http/stage-trpc.ts now owns for the matrix fixtures. It sends no CSRF header on mutations.

## Why

One home per concept. The copies drifted once already: the CSRF sweep had to fix each separately, and this one still differs from the floor helper on mutations.

## Done when

multi-user.ts calls the floor helper, or the floor helper takes the refusal vocabulary a seed needs, and its own copy is deleted. tests/tooling/seed/multi-user-existing-member.int.test.ts stays green.

## Evidence

Filled at landing: what ran and where its output is.
