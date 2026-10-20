---
kind: work
status: open
updated: 2026-10-20
priority: P3
plan: test-foundation
---

# Second pass on the caught-failure waivers the 1049 phase 3 audit left UNSURE

## What

The 1049 phase 3 audit left a set of caught-failure-ownership waivers marked UNSURE: still waived, owner not proven. The list is reports/review/1049-p3/unsure.txt (shard and site). Run after the reader-gap item lands, since some may resolve once the readers see them.

## Why

An unproven waiver is an exemption nobody has judged.

## Done when

Each listed waiver is KEEP with a named owner path:line, removed as redundant, or fixed as a real defect with a red-first test.

## Evidence

Fold in the p3-19 review notes: the line-112 record's diff field quotes the old marker text, the panel-flags.ts line 45 marker omits the --help consumer at panelPresetNames line 55, and the waiver playbook needs one sentence for a REAL DEFECT whose fault is in a consumer, where the marker stays.
