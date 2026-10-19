---
kind: bug
status: open
updated: 2026-10-19
priority: P2
---

# Grant or move the ungranted ts-morph projects and browser launch in tooling

## What

The tooling plumbing family suite reds on the live tree: tooling-project-home flags new Project constructions in tooling/src/floor/code-facts/semantic-inventory-reader.ts and tooling/src/floor/compiler/semantic-inventory-extract.ts (from 86d8b422f9), and tooling-browser-door flags chromium.launch in tooling/src/verify/ops/scoped-test.ts (from 0231cc4d6d). None has a reviewed grant.

## Why

A gate red on main hides any new finding behind it, and a second workspace loader or browser door outside the sanctioned home is what these gates exist to stop.

## Done when

Each site either moves behind the sanctioned loader or browser door, or takes a reviewed grant naming what it loads and its end condition; tests/tooling/verify/gates/tooling-plumbing-family.suite.test.ts is green on main.

## Evidence

Filled at landing: what ran and where its output is.
