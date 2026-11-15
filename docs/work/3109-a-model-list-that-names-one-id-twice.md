---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# A model list that names one id twice shows it once

## What

No endpoint reader dedupes ids, and the picker keys its rows by id, so a list that repeats an id renders a duplicate React key. Keep the first row per id in the listing.

## Why

A repeated id misrenders the picker and the capability read picks the first row silently.

## Done when

A draft list whose rows repeat an id lists it once, proven through the add dialog's list read.

## Evidence

Filled at landing: what ran and where its output is.
