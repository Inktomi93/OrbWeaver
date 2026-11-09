---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: duplicate-action-door on the rails and Characters, Chat, Config

## What

The design audit rule duplicate-action-door fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat, Config. Examples: the rails and Characters: checkpoint home/requested-pane-composition at div.flex:nth-of-type(2) > div.flex:nth-of-type(2) > div.flex:nth-of-type(1) > div.flex:nth-of-type(2) > div.group\[data-slot=list-row-root]:nth-of-type(1) > butt; Chat: checkpoint message-operations/wire-trace at div.flex:nth-of-type(1) > section.flex:nth-of-type(1) > div.flex:nth-of-type(1) > div.flex\[data-slot=log-viewer-root]:nth-of-type(1) > div.flex\[data-slot=log-vi; Config: checkpoint config/chat-behavior-Message handling-landing at \[aria-label=Primary] > div.flex:nth-of-type(1) > div.shell-rail-group:nth-of-type(2) > button.inline-flex\[data-slot=button]:nth-of-type(2). Runs: surface-Nn5cKU, surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The duplicate-action-door finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
