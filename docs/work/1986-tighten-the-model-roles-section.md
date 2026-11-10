---
kind: work
status: doing
updated: 2026-11-10
priority: P2
area: ui
lane: wt/agent-aa440b9474aaa4063
plan: cross-surface-consistency
---

# Tighten the Model roles section

## What

In `packages/client/src/features/credentials/components/connections-roles-section.tsx`, move each role's long explanation behind an info control, size the role selects to their content, and group Utility preset with the Utility role.

## Why

Each role carries several lines of prose, needs chips, a status line and a full-width select, so the page reads as a manual.

## Done when

Every role fits on a short row with its select at desktop width, Utility preset sits inside the Utility group, and a ux-reviewer pass on Model roles reports no finding.

## Evidence

Filled at landing: what ran and where its output is.
