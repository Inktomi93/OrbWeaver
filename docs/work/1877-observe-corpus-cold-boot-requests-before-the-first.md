---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: testing
plan: test-foundation
---

# Observe corpus cold-boot requests before the first app navigation

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B032-Q003`: Provide the cold-watch cases an unnavigated page after context-only auth/settings setup; attach watchFaults before any application navigation. Keep the stylesheet-abort positive control.

Inspect `tests/e2e/corpus-cold-boot.spec.ts`, `tests/e2e/support/corpus-test.ts`, `tests/e2e/support/modes.ts`.

## Why

`AF3-B032-Q003`: The shared corpus page fixture currently navigates config and Home before the watcher exists, leaving first-navigation asset failures outside its evidence window.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B032-Q003`: Selected corpus cell records a deliberately refused first-navigation asset and fails the cold case; healthy cold navigation passes. Undefined-style non-corpus behavior and native fixture ownership remain correct.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
