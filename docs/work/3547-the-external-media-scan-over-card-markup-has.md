---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: ui
plan: chat-html-and-presets
---

# The external media scan over card markup has no stated bound

## What

`holdsExternalMedia` in `packages/ui/src/content/sandbox-frame/external-media.ts` reads the whole card markup with no length cap. The work is linear and the answer changes no policy.

## Why

A scan at a trust boundary has no stated cost.

## Done when

The scan has a stated bound and refuses to show a notice past it, with a test for the bound.

## Evidence

Filled at landing: what ran and where its output is.
