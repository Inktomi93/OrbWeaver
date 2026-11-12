---
kind: tooling
status: open
updated: 2026-11-12
priority: P2
area: tooling
plan: cross-platform
---

# No ESLint part needs more memory than a standard macOS runner has

## What

On the macOS contributor runner the tests part of `scripts/eslint-parts.ts` ran many times slower than on the development box while every part peaked at about the same memory, well under what the tests part uses when it has room. The part is running against the runner's memory and spends its time collecting garbage. The parts were sized to the memory bar of the development box, not to the smallest runner the workflow uses. Timings and peaks: the contributor run on the pushed main, the macOS job.

## Why

The owner's rule is that checks fit a standard CI runner, and the contributor proof on macOS spends most of an hour in one lint part.

## Done when

The parts are cut so that none needs more memory than the smallest runner the workflows use, the part test still proves every file is linted once, and the macOS contributor job's lint step finishes in a time in line with the other parts.

## Evidence

Filled at landing: what ran and where its output is.
