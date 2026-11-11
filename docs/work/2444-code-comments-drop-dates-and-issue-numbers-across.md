---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: docs
---

# Code comments drop dates and issue numbers across kit, contracts, db and the tooling floor

## What

The comment law bans dates and issue or board numbers in comments. The review counted many such comments in `packages/kit`, `packages/contracts`, `packages/db` and `tooling/src/floor`; `packages/kit/src/card-frame/index.ts` is the densest file. The facts in them matter; the format is the defect. Source: the kit, contracts, db and tooling-floor unit files under `docs/work/codebase-review/units/`.

## Why

Dated comments read as history, and a dead issue number cannot be followed.

## Done when

A sweep of those four trees for date stamps and issue-number cites returns none, and each rewritten comment keeps its claim.

## Evidence

Filled at landing: what ran and where its output is.
