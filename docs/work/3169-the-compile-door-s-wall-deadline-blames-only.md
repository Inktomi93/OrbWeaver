---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: regex
plan: import-robustness
---

# The compile door's wall deadline blames only the pattern it stopped

## What

The wall reclaim in `probeFindCompiles` covers a whole batch, so a very large honest import on a loaded host can refuse its tail as unchecked.

## Why

An honest import can lose scripts to load rather than cost.

## Done when

The deadline is per pattern, or an unchecked tail is measured again in a new worker, with a case that proves an honest tail lands.

## Evidence

Filled at landing: what ran and where its output is.
