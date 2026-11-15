---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: import
plan: import-robustness
---

# A preset file's script list has a count cap on both import doors

## What

Each script in a preset file is bounded, and the list itself has no count cap on the single-file door or the folder door.

## Why

A file with a very long list makes one import call do unbounded work; the cap protects from abuse, and it must sit well above what a large public preset carries.

## Done when

Both doors refuse a preset file whose script list is over a named maximum, by name, with nothing stored, and a file at the maximum imports; the maximum is one constant.

## Evidence

Filled at landing: what ran and where its output is.
