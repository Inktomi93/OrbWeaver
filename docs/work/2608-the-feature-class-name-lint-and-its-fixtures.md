---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: checked-law
---

# The feature class-name lint and its fixtures match the layout and button recipes

## What

Cases of tests/tooling/eslint-feature-classname.test.ts fail on main: the Row end-justify class became justify-end-safe and the Button small-size block recipe moved to the control minimum block, and the rule's fixtures kept the old spellings. The rule itself is right: it reads the recipe tables at lint time, and a probe lint mapped both new spellings to their props. Only the fixtures are stale. The file sits under tests/tooling, which the node suite and CI leave out, so nothing reported it.

## Why

The rule sends a hand-written class in a feature to the primitive prop that owns it. If it no longer recognises the classes the recipes emit, a feature can write them by hand and nothing fails.

## Done when

The fixtures use the spellings the recipes emit, or read them from the recipes so a recipe change cannot leave them stale. The file passes, and it joins the pre-push repository list if it runs in seconds.

## Evidence

Filled at landing: what ran and where its output is.
