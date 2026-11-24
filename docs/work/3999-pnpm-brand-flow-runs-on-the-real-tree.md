---
kind: bug
status: open
updated: 2026-11-24
priority: P1
area: tooling
---

# pnpm brand-flow runs on the real tree under the memory bar

## What

A whole-tree pnpm brand-flow run aborted with a Node heap out-of-memory at the 16 GB heap (exit 134) during the cb-misc lane, so the brand sweep in 3913 cannot be measured.

## Why

A tool that cannot finish on the real tree gives no verdict, and the owner's bar is one run under 16 GB for tools other than unwired.

## Done when

A profiled whole-tree brand-flow run on main finishes under the bar with both processes' peaks reported, the retainer that grew is named, and 3913's done criterion can be measured.

## Evidence

Filled at landing: what ran and where its output is.
