---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: refinery
lane: wt/agent-adb68c6b9e2624d09
plan: unwired-code
---

# The refinery offers its rewrite and analyze modes

## What

REFINERY_REWRITE_MODES conservative and expansive and REFINERY_ANALYZE_MODES quick are built on the server with prompts, budget factors and editable prompt text, and the stage-config input accepts them, but the refinery client always sends the defaults or a custom schema and has no control to choose a mode.

## Why

Owner ruling: the modes stay and the refinery gets a picker, so built work and user-edited prompt text are not thrown away.

## Done when

The refinery shows a mode picker for the rewrite and analyze stages, the chosen mode reaches the stage-config input and runs its prompt, the default stays as today, and a CT covers choosing each mode.

## Evidence

Filled at landing: what ran and where its output is.
