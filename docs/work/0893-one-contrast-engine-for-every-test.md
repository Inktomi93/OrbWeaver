---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: tests
plan: test-mirror
---

# One contrast engine for every test

## What

The WCAG luminance and contrast kernel is hand-copied in rules-section, appearance-sizing, app-shell, home-surface (with a different knee, 0.04045), part-vs-surface, badge.ct and the palette-contrast suite, which also re-implements three kit colour functions; a kit suite grades itself with kit's own math. Pass the shared engine (tooling/src/floor/instrument/wcag.ts or the kit) into page.evaluate and delete the copies.

## Why

Copies disagree today, so contrast verdicts depend on which test measured.

## Done when

One kernel; every contrast test calls it; the diverging knee is gone; the kit suite is checked against an independent reference.

## Evidence

Filled at landing: what ran and where its output is.
