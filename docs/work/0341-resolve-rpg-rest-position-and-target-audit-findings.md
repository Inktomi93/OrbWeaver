---
kind: work
status: open
updated: 2026-10-01
priority: P3
area: rpg
---

# Resolve RPG rest-position and target-audit findings

## What

The Waystone sun and moon remain translated between device pixels when motion stops, contrary to the rest-placement rule. The audit also reported gold and Grit touch targets and layer offsets that still need direct measurement. Review and captured results: reports/alpha-product-completion/rpg-readability/review\.md.

## Why

The completed readability fixes do not resolve these other findings. Keep confirmed defects separate from missing measurements.

## Done when

Preserve continuous clock movement while satisfying integer-line-boxes section 9. Measure the gold and Grit effective hit extents and the reported layer offsets. Fix confirmed defects at their shared owner and document measured retractions for false findings. Keep image, off-screen and animation measurement limits explicit.

## Evidence

Filled at landing: what ran and where its output is.
