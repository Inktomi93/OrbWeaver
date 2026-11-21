---
kind: bug
status: open
updated: 2026-11-21
priority: P3
area: automation
plan: cross-surface-consistency
---

# The automation rule editor labels world info positions with readable names

## What

packages/client/src/features/automation/components/rule-list-action-fields.tsx labels its position options with raw ids such as authors_note_top. WORLD_INFO_POSITION_LABELS already holds the readable labels.

## Why

Raw ids read as internal values to a user.

## Done when

The editor reads its labels from WORLD_INFO_POSITION_LABELS, with a CT.

## Evidence

Filled at landing: what ran and where its output is.
