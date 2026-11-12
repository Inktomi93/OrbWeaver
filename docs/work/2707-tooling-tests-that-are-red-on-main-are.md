---
kind: tooling
status: open
updated: 2026-11-12
priority: P2
plan: checked-law
---

# Tooling tests that are red on main are triaged and fixed

## What

A whole run of `pnpm test:tools` on main still fails one case per run, a different one each time, each a 5 s case timeout while the box sits at full load. The repeated setup that made the lint and dependency-cruiser self-tests slow is fixed: generated path patterns, per-case checker processes, the config-time production indexes and per-snippet programs. What remains: `tests/tooling/eslint-ct-responder.test.ts` has one case that type-checks the real server router and takes about 3 s alone, and the browser-driven suites, tracked in their own item, keep the box saturated for the whole run. Tooling tests are outside the product test command, the pre-push list and CI.

## Why

A red tooling test is a checker nobody is watching, and some of these hold rules the law cites.

## Done when

A whole run of `pnpm test:tools` passes on main twice in a row. No case gets a larger time budget or a slow tag to get there.

## Evidence

Filled at landing: what ran and where its output is.
