---
kind: tooling
status: open
updated: 2026-10-12
priority: P3
area: tooling
---

# A review releases exactly the stage it booted

## What

Side-eye boots isolated snap stages under the reviewed lane's worktree and leaves them up for the 60-minute idle TTL after it reports; worktree-cleanup.sh releases them only when the worktree is removed, so live lanes accumulate idle bands and the 3-band cap stalls the next review. The only teardown is --stage-down --stage-owner <checkout> --force, which kills every band that checkout owns, so a review cannot release just its own.

## Why

Idle review stages block other reviews until the TTL expires.

## Done when

snap gains a per-band teardown (--stage-down --band N, refusing a band with a live session); the side-eye role releases the band(s) it booted as its last step; a test shows a second band of the same checkout survives.

## Evidence

`pnpm snap --stage-down --band <n>` releases band `n` of the caller's own rows (`tooling/src/snap/ops/stage-status.ts` `teardownView`). It refuses a band with a live session; `--force` overrides. It never touches a sibling's row or a row-less band, and skips the box-wide browser and orphan-dir sweeps. The side-eye role releases its band as its last step, reading `<n>` from the `[snap-stage] ... band <n>` line. Test: `tests/tooling/snap/ops/stage-down-band.test.ts`, red on the old code (two failures), green after. Also run: `session-plan.test.ts`, `cli-truth.suite.int.test.ts`.
