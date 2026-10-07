---
kind: bug
status: doing
updated: 2026-10-07
priority: P1
area: testing
lane: codex/smoke-real-paths
---

# Make chart assertions distinguish headings from loading status

## What

Repair ambiguous chart locators while preserving populated canvas and loading-state assertions.

## Why

Chart loading status repeats the visible label and makes broad text locators ambiguous.

## Done when

Affected chart and discovery component tests pass without retries and retain their rendering assertions.

## Evidence

Filled at landing: what ran and where its output is.
