---
kind: work
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Code review P3 bundle for the reach, audit and shared-owner branches

## What

From the cb-reach-audit code review report under reports/code-reviewer: a singular and a bulk workload schedule of one kind, cadence and owner share every name; a foreign schedule row carries no owner handle until admin.listUsers resolves; ButtonWrapContext crosses portals, so a dialog opened from an EmptyState action would wrap its Buttons; the coarse-pointer gap change and the text-columns test wording; the ink-end probe branch is not pinned by a fixture; an isVisible filter in the walker change is not stated in its commit. The shared-owner branch also changes visible schedule and empty-state copy and layout, which needs one ux-reviewer look.

## Why

Each leaves a name collision, a leak path or an unpinned detector branch that the merged work did not settle.

## Done when

Each finding is fixed with a CT or fixture, or answered with a cited reason in this item's Evidence, and the schedule and empty-state changes get one rendered ux-reviewer pass.

## Evidence

Filled at landing: what ran and where its output is.
