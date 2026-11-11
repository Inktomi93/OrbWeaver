---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: docs
---

# Code comments drop dates and issue numbers across kit, contracts, db and the tooling floor

## What

The comment law bans dates and issue or board numbers in comments. The review counted many such comments in `packages/kit`, `packages/contracts`, `packages/db`, `tooling/src/floor` and, most of all, `packages/server/src`; `packages/kit/src/card-frame/index.ts` is the densest kit file. The facts in them matter and every sampled one was true; the format is the defect. Where a comment carries a measured result or the reason for a ruling, the fact moves to an ADR or a work item and the comment cites that anchor. Source: the kit, contracts, db, tooling-floor and server-foundation unit files under `docs/work/codebase-review/units/`.

## Why

Dated comments read as history, and a dead issue number cannot be followed.

## Done when

A sweep of those trees for date stamps and issue-number cites returns none. Each rewritten comment keeps its claim, and a measured result or ruling reason has an ADR or work-item home that the comment cites.

## Evidence

Filled at landing: what ran and where its output is.
