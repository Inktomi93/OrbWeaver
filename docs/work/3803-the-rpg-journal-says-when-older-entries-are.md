---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: rpg
lane: wt/agent-ab48c9f67c391d41f
plan: unwired-code
---

# The RPG journal says when older entries are beyond the page

## What

rpg-journal-tab.tsx reads one page of 100 by design (JOURNAL_PAGE, a reading surface, not an infinite feed) and never says that older entries exist.

## Why

In a long campaign older journal entries vanish with no sign.

## Done when

The journal states how many entries exist when it shows the newest page and can load the older ones, and a CT covers a journal past one page.

## Evidence

Filled at landing: what ran and where its output is.
