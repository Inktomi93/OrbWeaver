---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# One error notice exposes one alert to assistive technology

## What

A review saw a second visible alert node for a single forced error notice, which a screen reader may announce twice. The toast is built in `packages/ui/src/primitives/toast/toast.tsx`. Its source puts one role on the root, so the second node is unconfirmed.

## Why

A notice announced twice is noise for a screen reader user and hides the next notice.

## Done when

A component test in `tests/ui/primitives/toast/` raises one error notice through the app's notify seam and asserts that exactly one visible node has the alert role and that the viewport region announces it once. If it passes on the current code it stays as the recorded answer. If it fails, the primitive is fixed and the test is red before and green after.

## Evidence

Filled at landing: what ran and where its output is.
