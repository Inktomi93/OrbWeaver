---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: regex
plan: import-robustness
---

# The regex tester and pipeline panels run a script on the main thread with no deadline

## What

The library tester (`regex-test-panel.tsx`) and the pipeline panel (`regex-pipeline-panel.tsx`) call `executeRegexScripts` from `@orb/kit/regex` through `packages/client/src/features/regex/lib/regex-preview.ts` during render on the main thread. The kit's executor now refuses a find pattern by length only, so a catastrophic pattern is no longer bounded. An imported script with find `(a+)+$` and a sample of 'a' characters followed by '!' freezes the tab in either panel, and the sample length cap does not bound it. Run both panels through a deadline that does not share the main thread, and add a dependency-cruiser rule that no `features/**` file imports the `@orb/kit/regex` executor.

## Why

A shared or imported script is hostile input, and the panels that preview it run it on the page the owner is typing in.

## Done when

A runaway pattern in either panel is stopped at a deadline, the page keeps answering, and the panel shows a stopped state, proven by a runaway case per panel. The dependency-cruiser rule refuses an executor import from `features/**` and its red proof is recorded.

## Evidence

Filled at landing: what ran and where its output is.
