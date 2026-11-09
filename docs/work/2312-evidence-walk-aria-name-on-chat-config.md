---
kind: bug
status: doing
updated: 2026-11-09
priority: P3
area: client
lane: wt/agent-ab263cc0ae4a110f2
plan: cross-surface-consistency
---

# Evidence walk: aria-name on Chat, Config

## What

The design audit rule aria-name fails in the desktop-1440-all-panes-evidence walk on Chat, Config. Examples: Chat: checkpoint context-chat_000000000000000000000004gk/tabs-0/0/dialog-1 at \[data-slot=popover-popup] > div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > div.flex:nth-of-type(1); Config: checkpoint config/theme-builder at div.flex:nth-of-type(1) > div.flex:nth-of-type(2) > section.flex:nth-of-type(1) > div.overflow-hidden:nth-of-type(1) > div.cm-editor:nth-of-type(1) > div.cm-scr. Runs: surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The aria-name finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
