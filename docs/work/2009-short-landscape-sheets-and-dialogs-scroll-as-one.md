---
kind: bug
status: doing
updated: 2026-11-07
priority: P2
area: ui
lane: wt/agent-afb5bff2b14113d1d
plan: cross-surface-consistency
---

# Short-landscape sheets and dialogs scroll as one box

## What

At 844x390 the New chat picker gives its list a 54px window inside a second scroller, and its footer overlays the search card so the focus ring stops mid-edge. The context sheet spends 199px on strips, leaves about 143px of content, and nests two scrollers. Owners: packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx, pickerWindow in packages/ui/src/primitives/command/variants.ts, packages/client/src/features/app-shell/components/context-bracket.tsx. Findings F1 and F5 in the UI rendered review report under reports/ux-reviewer.

## Why

A phone user in landscape picks from one visible row and scrolls two boxes to reach the last of a pane. UI-Density-Law section 6 fixes a P2 before a sweep stage closes, and section 8.1 asks the pane to scroll as a whole.

## Done when

At 844x390 coarse the picker shows several rows, the context sheet scrolls as one box, neither nests a scroller, and no focus ring is cut. One `container.cq-24` threshold owns both, read by a dialog popup as `dialog-short` and by a bracketed Context pane as `@container shell-panel`. A CT or snap measurement proves it.

## Evidence

Filled at landing: what ran and where its output is.
