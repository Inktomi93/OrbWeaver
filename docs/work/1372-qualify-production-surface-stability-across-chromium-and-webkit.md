---
kind: work
status: open
updated: 2026-10-25
priority: P3
area: tests
---

# Qualify production surface stability across Chromium and WebKit

## What

Build a production-backed layout-stability matrix from the actual section, settings and modal registries and eligible shared-test-data subjects. Reuse existing E2E navigation, readiness, viewport descriptors and the installed WebKit engine. Cover initial document loading and unexpected post-ready movement separately. This is a low-priority enhancement, not a prerequisite for test restoration or current styling enforcement.

## Why

Selected shell journeys do not qualify every surface at supported sizes and orientations. Warm fixture navigation and unsupported metrics can produce misleading clean scores.

## Done when

Derive one complete surface and layout population without another runner or hand-maintained viewport grid. Include Chromium desktop and phone portrait/landscape plus applicable WebKit execution. Install supported collection before application scripts and use real readiness and load signals. Preserve raw, input-adjacent and virtualized attribution. Distinguish official largest-session-window CLS from accumulated shift totals. Unsupported, inapplicable and unreached cases remain explicit, never zero or pass. Prove late-layout detection with planted defects and clean controls. Follow D308 for measurement verdicts. Preserve native artifacts and real-device limits; no screenshot baselines, private data, production window.\_\_orb dependency or full authentication-layout Cartesian expansion.

## Evidence

Filled at landing: what ran and where its output is.
