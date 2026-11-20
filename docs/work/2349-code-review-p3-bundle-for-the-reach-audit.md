---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Code review P3 bundle for the reach, audit and shared-owner branches

## What

From the reach and audit code review, still open after the schedule name collision was fixed: a foreign schedule row carries no owner handle until the admin user list resolves; `ButtonWrapContext` crosses portals, so a dialog opened from an `EmptyState` action wraps its Buttons, and the RPG Journal composer and the New quest row now sit in such an action slot; the coarse-pointer gap change and the text-columns test wording; the ink-end probe branch is not pinned by a fixture. The schedule and empty-state copy and layout from the shared-owner work need one rendered look.

## Why

Each leaves a name collision, a leak path or an unpinned detector branch that the merged work did not settle.

## Done when

Each finding is fixed with a component test or a fixture, or answered with a cited reason in this item's Evidence, and the schedule rows and the RPG empty states get one rendered ux-reviewer pass.

## Evidence

Filled at landing: what ran and where its output is.
