---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: tests
plan: test-foundation
---

# Feature surfaces mount from tests through the client composition door

## What

Two lanes could not write a CT because the surface had no public mount. `CharacterCardTile`, `ChatSummaryRow` and `ChatDocumentsSection` are unreachable: the feature indexes export nothing, and `client-feature-front-door` in `.dependency-cruiser.ts` forbids deep imports. The credentials and connection role-slot panes have no CT harness. The design's Client mounting section names the production-backed CT mount door as built but not qualified.

## Why

A surface no test can mount gets no behavioral coverage, and a lane then stops or reaches for a test-only export, which item 0989 bans.

## Done when

The client composition door mounts a feature surface by section, with its tRPC reads served through the existing typed recorder. One CT each for the characters library, the chats pane and the credentials panes mounts through it and asserts one behavior. A planted production defect in one surface fails its CT. The design's Client mounting section names the qualified door.

## Evidence

Filled at landing: what ran and where its output is.
