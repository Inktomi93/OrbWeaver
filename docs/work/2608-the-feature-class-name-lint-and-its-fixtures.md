---
kind: tooling
status: open
updated: 2026-11-12
priority: P2
area: tooling
plan: checked-law
---

# The feature class-name lint and its fixtures match the layout and button recipes

## What

Cases of tests/tooling/eslint-feature-classname.test.ts fail on main: the Row end-justify class became justify-end-safe and the Button small-size block recipe moved to the control minimum block, and the rule's fixtures kept the old spellings. The file sits under tests/tooling, which the node suite and CI leave out, so nothing reported it. It is not known whether the rule still maps the new classes to their props or only the fixtures are stale.

## Why

The rule sends a hand-written class in a feature to the primitive prop that owns it. If it no longer recognises the classes the recipes emit, a feature can write them by hand and nothing fails.

## Done when

The rule reads the class spellings from the recipes or agrees with them by a test that fails when a recipe changes, the file passes, and each of the failing shapes is proved to be refused in feature code with its prop named. The file joins the pre-push repository list if it runs in seconds.

## Evidence

Filled at landing: what ran and where its output is.
