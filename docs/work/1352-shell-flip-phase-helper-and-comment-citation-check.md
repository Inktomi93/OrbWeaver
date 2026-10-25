---
kind: work
status: doing
updated: 2026-10-25
priority: P2
area: client
lane: cb-leg9
---

# Shell flip phase helper and comment citation check land

## What

holdFlipInPhase (packages/client/src/lib/flip-phase.ts) keeps rows mounted mid-door and mid flank-door in phase and releases on end, cancel and unmount; mobile.css cancels the list band flip; tests/tooling/doc/comment-path-citations.repo.int.test.ts fails on a comment naming a missing path, with 287 stale citations fixed.

## Why

Late-mounted rows slid out of phase and stale comment citations pointed at deleted files.

## Done when

Commit e998238ee7 passes review and merges; the motion CT and citation test pass on main.

## Evidence

Filled at landing: what ran and where its output is.
