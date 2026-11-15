---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: tests
plan: test-foundation
---

# Adjudicate the remaining guess-wait rows in the component test inventory

## What

The inventory of component tests that read the page once after a layout change, press on a bare DOM fact, or assert with the default budget over a long job has its high rows rewritten. Its medium and low rows, and the pattern hits nobody has read yet, are still open. The inventory is the report `2026-11-15-ct-race-inventory.md` under `reports/reviews/`.

## Why

Each unread row is a test that can fail on a slow runner for a reason that is not a product defect.

## Done when

Every medium and low row is rewritten to wait on a published state or marked sound with the reason, and every unread hit is classified.

## Evidence

Filled at landing: what ran and where its output is.
