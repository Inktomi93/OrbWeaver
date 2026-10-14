---
kind: work
status: open
updated: 2026-10-14
priority: P3
area: client
plan: test-foundation
---

# Restore client feature ownership for misplaced composites and presentation types

## What

Adjudicate packages/client/src/components/tracker-blocks and greeting-studio.tsx against actual production feature owners. Current callers reach RPG and character respectively; the greeting header names an absent chat mount. Move single-owner components into their feature without changing behavior. Place packages/client/src/features/automation/contract/fire-outcome.ts within a sanctioned feature bucket. Coordinate type-home enforcement with its owning assignment.

## Why

Shared composites require cross-feature or genuinely app-level ownership. Multiple surfaces inside one feature do not establish shared ownership. The feature structure policy excludes a root contract bucket.

## Done when

Confirm ultimate production callers through aliases and barrels before each move. Retain genuinely shared helpers, including connection-role mutations used by credentials and automation. Update imports, component API types, source headers and affected test references without legacy fixture retrofit. Scoped types, applicable lint, focused placement checks and affected behavior pass. Add no bucket exemption or new public door.

## Evidence

Filled at landing: what ran and where its output is.
