---
kind: work
status: open
updated: 2026-11-13
priority: P2
area: tests
plan: test-foundation
---

# Test names the label census cannot classify are read site by site

## What

The label census under `tooling/src/label-census/` leaves three classes uncounted because no production literal matches them: a name production builds with no fixed words, a template whose words come from constants, and a grammar a test joins by hand from imported constants. A sample found that a share of each is a name production renders, typed or rebuilt by hand in the test.

## Why

A hand-joined grammar passes while production changes its word order or its joining words, and a hand-typed built name breaks for the wrong reason on a rename.

## Done when

Every site in the three classes is read against its mounted component. A rendered name calls the production label function, minted in the feature's names leaf where production composes inline. Every other site is judged with a reason from the closed list. The census reports no unjudged site in those classes.

## Evidence

Filled at landing: what ran and where its output is.
