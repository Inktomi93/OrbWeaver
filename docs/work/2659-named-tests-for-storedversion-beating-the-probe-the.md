---
kind: work
status: open
updated: 2026-11-12
priority: P2
plan: checked-law
---

# Named tests for storedVersion beating the probe, the PNG card chunk CRC and the vLLM pipe watchdog

## What

`docs/law/Spine-Testing.md` lists behaviors that must each be a named test at its mirror. No test names the rule that the `user_settings` version column beats the version inside the blob (`packages/contracts/src/settings/index.ts`, `packages/contracts/src/versioned-config/index.ts`), none asserts the dual chunk and CRC of `packages/kit/src/png-card-chunk/index.ts`, and none covers the vLLM death-couple pipe watchdog. For the watchdog, first find whether the behavior still lives in this repository; if it does not, amend the law line instead.

## Why

The law calls these behaviors ones that must not regress silently, and a change to any of them passes every suite today.

## Done when

Each behavior that lives in the repository has a named test at its mirror with a shown red, and the law line lists only behaviors the repository holds.

## Evidence

Filled at landing: what ran and where its output is.
