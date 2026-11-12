---
kind: bug
status: doing
updated: 2026-11-12
priority: P3
area: client
lane: wt/agent-ab272ed4fef9cc84a
plan: cross-surface-consistency
---

# Review leftovers on the topbar title reveal and the arrival hold

## What

From the recheck of the client title and focus work, in the client leg review under reports/code-reviewer. The boundary-keyed clause in `packages/client/src/lib/use-focus-on-mount.ts` never decides an outcome: with it replaced by a constant every test gives the same result, so it and `ArrivalBoundaryContext` are either unproved or dead. The touch floor check in `tests/client/features/app-shell/surfaces/topbar-title-reveal.ct.tsx` polls and passed once with the defect present. A press that starts on Rename opens the reveal instead when the layout changes during the press (`packages/client/src/components/title-reveal.tsx`). The wide title control in `packages/client/src/features/chat/components/chat-header-title.tsx` holds block elements inside a button. A member's wide title jumps toward the end when it becomes cut, because it turns into a button with padding.

## Why

An unproved branch in the focus hook is the kind of code that hides the next focus defect, and the rest are small faults on a control every room shows.

## Done when

The boundary clause has a test that is red without it, or it and its context are deleted with the reason found. The floor check reads a settled bar and is red on every repeat against the defect. A press acts on the state it started in. The title control holds phrasing content only. A member's title keeps its position when it crosses between cut and uncut, shown by a component test.

## Evidence

Filled at landing: what ran and where its output is.
