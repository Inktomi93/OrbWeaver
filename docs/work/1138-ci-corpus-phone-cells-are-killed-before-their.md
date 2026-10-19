---
kind: bug
status: doing
updated: 2026-10-19
priority: P2
lane: wt/agent-a2f6cc226f4a38146
---

# CI corpus phone cells are killed before their tests finish

## What

In CI run 39279178336, the signed-in phone corpus cells (corpus-phone-echo and siblings) end with 'Corpus matrix verdict: exit=2' after about ten minutes, with no failing test: phone-echo passed fewer than half its cases, then the run marker swept the process group. A cell time budget or watchdog appears to stop the cell before the suite can finish at phone speed. A cold first boot (about 60 s, warm-up degraded once) adds to it.

## Why

A cell killed mid-suite gives no verdict on the tests it never ran, so CI reports red with no test evidence, and the remaining phone cases are never qualified.

## Done when

The cause of the kill is found in the matrix runner (budget, watchdog or a hung test), fixed at its cause or given a measured per-cell budget with its reason, and every phone corpus cell reaches a real verdict in CI.

## Evidence

Filled at landing: what ran and where its output is.
