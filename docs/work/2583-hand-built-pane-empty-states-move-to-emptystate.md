---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: client
plan: cross-surface-consistency
---

# Hand-built pane empty states move to EmptyState, and the kept ones cite a ruling that resolves

## What

A filtered miss in corpus-browse-view\.tsx and the empty panes in plugin-scripted-surface.tsx, rpg-journal-tab.tsx, rpg-quests-tab.tsx and rpg-map-tab.tsx are built by hand. Each converts to EmptyState with its action. The empty thread in message-list-surface.tsx and the documents rail tile are kept only if the ruling each comment cites exists. Sites: the class 2 table in the survey rulings for item 1766 under reports/cb-survey-1766.

## Why

The three-states law names EmptyState with an action for a surface's empty state.

## Done when

Each convert site renders EmptyState with a component test. The empty thread and the documents rail tile each cite a law line or decision that exists, or convert.

## Evidence

Filled at landing: what ran and where its output is.
