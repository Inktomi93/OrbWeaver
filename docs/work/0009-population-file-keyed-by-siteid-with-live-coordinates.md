---
kind: tooling
status: done
updated: 2026-09-23
priority: P2
area: verify
plan: doc-migration
evidence: 267dd96a3
---

# Population file keyed by siteId with live coordinates

## What

Rework the caught-failure census (formerly under docs/reviews, now `tooling/src/verify/gates/caught-failure-ownership.population.json`) so the committed rows carry only the human judgment keyed by `siteId` (`verdict`, `reason`) and none of `line`, `column`, `markerLine` or `snippet`; `tooling/src/verify/ops/gen/caught-failure-population.ts` derives the coordinates at read time from the shared reader `tooling/src/verify/lib/caught-failure.ts`, and `tooling/src/verify/gates/caught-failure-ownership.ts` joins on `siteId`. Move the file beside its reader under `tooling/src/verify/gates/` (the `baseui-surface.manifest.json` precedent) and re-point the `ledgers:fresh` derivation. A `siteId` whose site is gone is a finding (two-sided), never a silent drop.

## Why

A line number in committed data stales on every insertion above it; the population file alone was touched by about one commit in eleven. Content-keyed rows survive a move.

## Done when

The file carries no coordinate fields; inserting a line above a site in a planted tree leaves `pnpm check:structure` green; deleting a site reds it by name; `pnpm check:ledgers-fresh` is green.

## Evidence

Filled at landing: what ran and where its output is.
