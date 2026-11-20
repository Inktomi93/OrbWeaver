---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: tests
plan: test-foundation
---

# Label maps are pinned by value where a swap would survive

## What

Tests pin which entry of a label map is selected, not its text, so a swap of two values survives. The unpinned entries include first-run recovery, the persona no-seat line, the prompt cache gloss for an unknown state, the add-model action labels for server and built-in, the open-card note entry, the fact minimum label, the schedule pending verbs and the preset move-to-zone label. Pending verbs for saving and creating have several homes, and Revoke and Reset each have two feature homes. The rpg end-to-end specs type Scene by hand.

## Why

A wrong label ships with every test green.

## Done when

Each listed entry is pinned by selection: the case shows the right constant renders and the other does not, and it goes red on a swap. No case restates a production string as a literal. The pending verbs read one vocabulary, Revoke and Reset each have one home, and the rpg specs read the production tab label.

## Evidence

Filled at landing: what ran and where its output is.
