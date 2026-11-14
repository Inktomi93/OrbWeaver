---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# Name what holds the Backup and Restore page wider than its column at 200% text

## What

On Settings, Backup and Restore at 200% text on a phone, the settings column scrolls sideways a little, and no descendant is measured past its edge, so the cause is unnamed. At 300% text a text paragraph on the page is the widener. The pages are `packages/client/src/features/workloads/components/backup-export-section.tsx` and `packages/client/src/features/workloads/components/backup-import-section.tsx`, inside `packages/client/src/features/config/surfaces/config-content-surface.tsx`.

## Why

A column that scrolls sideways has stopped reflowing, and the cause stays hidden until it is named.

## Done when

A component test in `tests/client/features/config/surfaces/` mounts the Backup and Restore page at 390px wide with 200% and 300% text and asserts that the column's scroll width equals its client width. The test's failure names the widening element, and the fix is made at that element's design-system home. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
