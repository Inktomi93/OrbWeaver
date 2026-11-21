---
kind: tooling
status: doing
updated: 2026-11-21
priority: P3
area: tooling
lane: wt/agent-ae7af3c0d37738586
plan: unwired-code
---

# The unwired shapes scan stops reporting mirrors, derived types and ruled look-alikes

## What

The shapes review confirmed scanner defects in tooling/src/unwired: one pair is reported in both orientations (shapes.ts pair key); deliberate matching reads only the first side (scan.ts deliberateEntry); perVerb comes from a path regex and only on synonyms (shapes.ts PER_VERB); Awaited\<ReturnType<typeof f>> and a shared extends Pick base count as separate homes; and the shapes scan never reads distinct-lookalikes.ts.

## Why

These rows bury the real repeated shapes.

## Done when

Each defect has a red-first planted case in tests/tooling/unwired/shapes.int.test.ts with a true twin that stays reported, per the nine cases in reports/unwired/shapes-judge.md, and the orchestrator reruns pnpm unwired shapes.

## Evidence

Filled at landing: what ran and where its output is.
