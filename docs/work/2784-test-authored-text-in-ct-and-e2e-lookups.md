---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: tests
plan: test-foundation
---

# Test-authored text in CT and e2e lookups comes from fixture constants

## What

Many CT and e2e lookups match text a story, fixture or corpus wrote, not a label production renders, mostly under `tests/ui/primitives`. Each such string is typed twice: once where the fixture is built and once in the lookup.

## Why

A fixture edit breaks the lookup that restates it, and the restated copies hide which lookups read production labels.

## Done when

Each lookup of test-authored text reads the constant its story, fixture or corpus exports, and the label census reports none restated.

## Evidence

Filled at landing: what ran and where its output is.
