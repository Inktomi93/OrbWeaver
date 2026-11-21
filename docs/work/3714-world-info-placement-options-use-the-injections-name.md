---
kind: bug
status: doing
updated: 2026-11-21
priority: P2
area: world-info
lane: wt/agent-ac33ee7cbe2ea7472
plan: cross-surface-consistency
---

# World info placement options use the Injections name and show the missing-seat case inline

## What

The entry editor's new placement options say Author's Note, which no other screen uses; the app calls it Injections (D116). What happens with no Author's Note or no example messages is only in a tooltip. Copy: packages/client/src/features/world-info/lib/world-info-names.ts.

## Why

One concept carries two names, and a tooltip-only rule is hidden on touch.

## Done when

The options name the seat as the rest of the app does, the missing-seat rule shows as visible hint text, with a CT.

## Evidence

Filled at landing: what ran and where its output is.
