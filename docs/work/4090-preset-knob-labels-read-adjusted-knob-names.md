---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: client
---

# Preset knob labels read ADJUSTED_KNOB_NAMES

## What

packages/client/src/features/preset/components/params-limits.tsx and packages/client/src/features/preset/lib/effective-knobs.ts spell the Reply pictures label by hand instead of reading ADJUSTED_KNOB_NAMES.replyMedia.label from @orb/contracts/chat.

## Why

A second home for a product label drifts silently from the one the tests read.

## Done when

Both sites import the constant and the preset CTs pass.

## Evidence

Filled at landing: what ran and where its output is.
