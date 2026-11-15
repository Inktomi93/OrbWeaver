---
kind: work
status: open
updated: 2026-11-15
priority: P1
area: tests
plan: test-foundation
---

# No component test guards the drawer viewport clip

## What

The Drawer viewport in `packages/ui/src/primitives/drawer/variants.ts` is clipped so a bottom sheet casts no shadow onto the phone tab bar. The change was proven with screenshot pixel measurements only.

## Why

A later edit can drop the clip unseen and bring back the shadow on the bar.

## Done when

A component test mounts a bottom sheet above the phone tab bar through the production shell and fails when the clip is removed.

## Evidence

Filled at landing: what ran and where its output is.
