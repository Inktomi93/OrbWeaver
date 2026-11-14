---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: stats
---

# Float residue can keep an emptied timeline or model row alive after a delete

## What

A delete subtracts each message's cost from the daily and model rows as a float. A bucket that held several priced turns can come back to a tiny nonzero cost instead of exactly zero, so the all-zero test that drops an emptied row (packages/server/src/domain/stats/persistence/rollup-grains.ts: emptied) keeps it, and a rebuild does not write it. Reproduce with several priced turns in one bucket deleted together; if it reproduces, compare the cost column against a tolerance or against its sample count.

## Why

Live must equal a rebuild on every shown figure.

## Done when

A server case deletes several priced turns that fill one bucket and one model, and the timeline and model list are equal on the live path and after a rebuild.

## Evidence

Filled at landing: what ran and where its output is.
