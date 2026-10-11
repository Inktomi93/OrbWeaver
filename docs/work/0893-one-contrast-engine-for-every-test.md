---
kind: work
status: doing
updated: 2026-10-11
priority: P2
area: tests
lane: wt/agent-ae019ccecda3ed2ba
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

Owner ruling 2026-10-11: yes, add fixed OKLab known-answer vectors as the independent oracle for the kit colour maths. The partial branch 63a00505fb+cc1cffc47f does not carry them; the item stays open until they land.
