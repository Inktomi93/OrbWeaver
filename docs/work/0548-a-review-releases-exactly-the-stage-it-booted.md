---
kind: tooling
status: open
updated: 2026-10-04
priority: P2
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

Filled at landing: what ran and where its output is.
