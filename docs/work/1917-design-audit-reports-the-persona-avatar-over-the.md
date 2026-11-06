---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# Design audit reports the persona avatar over the Databank target at 844x390

## What

Audit finding verified false at 844x390 (run slot reports/runs/snap/agent-acee2ee5ffd47ff1f-3539114-2026-11-06T09-09-33-940Z and -3543294-2026-11-06T09-10-00-021Z). The rail's section scroller (.shell-rail-sections) spans y 56..242; Databank sits at y 322..378 inside it, clipped by that scroller, so the persona avatar owns the point the audit asked. A real tap on Databank scrolls the scroller (scrollTop 0 to 201) and opens the section (aria-current=page). Open question: the Databank, Presets and Refinery rail buttons start out of view with no visible scroll cue; the obscured-target census does not treat a point clipped by a scroll ancestor as unreachable-by-scroll (tooling/src/ui-audit/ops/walker/obscured-reach.ts).

## Why

An obscured control cannot be pressed.

## Done when

A real tap at 844x390 reaches Databank, or the capture shows the audit was wrong.

## Evidence

Filled at landing: what ran and where its output is.
