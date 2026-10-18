---
kind: tooling
status: open
updated: 2026-10-18
priority: P2
area: tooling
plan: test-foundation
---

# Policy pass output groups UNKNOWN analysis gaps

## What

check:structure prints one line per UNKNOWN analysis gap (tooling/src/verify/lib/render.ts, renderPolicyPass). Gates under D328 can report thousands of gaps per run, which buries findings. Group the printed gaps by policy and reason, with per-file counts and a few example sites, and keep the complete list in the run artifact.

## Why

Owner ruling: a list of thousands of advisory lines teaches readers to skip the output; grouping keeps every gap visible without drowning the findings.

## Done when

The console shows grouped gap counts per policy and reason with example sites, the full gap list stays in check-structure.json, findings and alarms render unchanged, and a render test covers both views.

## Evidence

Filled at landing: what ran and where its output is.
