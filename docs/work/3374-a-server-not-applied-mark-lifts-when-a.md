---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# A server Not applied mark lifts when a later turn applies the script

## What

Decide whether a clean later turn clears a script's server Not applied mark, and build it if so.

## Why

The mark lifts only on a pattern edit or a reload (packages/client/src/lib/display-script-stops.ts noteServerStoppedScript), so a script that recovered stays marked. Code review of ee979313d0, Combined tip delta (reports/code-reviewer/-cb-review-regex-client.md in agent-a8071996f9c5e8978).

## Done when

The ruling is recorded, and if it is to lift, a CT shows the mark gone after a turn with no warning for that script.

## Evidence

Filled at landing: what ran and where its output is.
