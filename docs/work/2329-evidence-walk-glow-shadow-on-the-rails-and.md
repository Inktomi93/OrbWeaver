---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: surface-walk
---

# Evidence walk: glow-shadow on the rails and Characters, Chat, Config

## What

The design audit rule glow-shadow fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat, Config. Examples: the rails and Characters: checkpoint refinery/execution/rewrite/result at \[data-testid=refinery-rewrite-lane] > div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > button.inline-flex; Chat: checkpoint context-chat_00000000000000000000000420/tabs-0/1/disclosure-10/dialog-0 at div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > button.inline-flex\[data-slot=b; Config: checkpoint config/automation/dialog-0 at div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > button.inline-flex\[data-slot=b. Runs: surface-Nn5cKU, surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The glow-shadow finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
