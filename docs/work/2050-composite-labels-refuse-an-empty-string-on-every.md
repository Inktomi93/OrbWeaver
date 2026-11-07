---
kind: work
status: open
updated: 2026-11-07
priority: P3
area: ui
plan: type-law
---

# Composite labels refuse an empty string on every label prop

## What

dismissLabel now refuses an empty literal, but ContentDismiss.label and submit.label do not, and a string variable still passes at every site.

## Why

An empty label is a button no screen reader can name, and the composites exist to make that impossible.

## Done when

Each composite label prop refuses an empty literal, and a shared non-empty label type owns the rule.

## Evidence

Filled at landing: what ran and where its output is.
