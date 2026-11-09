---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: undersized-ui-text on the rails and Characters, Chat, Config

## What

The design audit rule undersized-ui-text fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat, Config. Examples: the rails and Characters: checkpoint home/native/chat.alsoOpen/1 at \[aria-label="Talkativeness: The ledger archivist: talks 75% chance to reply unprompted"] > span.font-sans\[data-slot=text]:nth-of-type(2); Chat: checkpoint context-chat_00000000000000000000000420/tabs-0/1 at \[aria-label="Scenario, inheriting"] > div.flex:nth-of-type(1) > p.font-sans\[data-slot=text]:nth-of-type(2); Config: checkpoint config-search-empty at \[data-slot=command-empty] > p.font-sans\[data-slot=text]:nth-of-type(1). Runs: surface-Nn5cKU, surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The undersized-ui-text finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
