---
kind: bug
status: open
updated: 2026-11-24
priority: P2
area: tooling
---

# The stryker config test fits its plugin import inside the test timeout

## What

tests/tooling stryker-config.test.ts times out at the 5 s default under a 6.2 s plugin import, and passes with a longer limit.

## Why

A test that fails on import time alone reads as a broken mutation config.

## Done when

The test imports the plugin once outside the measured case or is tagged slow under the house rule, passes at the default limit on a loaded box, and still fails when the config is broken.

## Evidence

Filled at landing: what ran and where its output is.
