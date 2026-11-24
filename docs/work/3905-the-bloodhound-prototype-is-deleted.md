---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-a8b15cbf5858a7272
plan: unwired-code
---

# The bloodhound prototype is deleted

## What

reports/api-play/ holds the prototype the graph was ported from, kept as reference while parity rows stay open.

## Why

D357: reference only until parity closes; a second copy of the engine invites edits to the wrong one.

## Done when

The parity audit of the prototype against tooling/src/unwired/graph/ lists no missing rule (each gap is ported with a planted case or dropped by a cited ruling), the prototype is archived outside the repository with its path in Evidence, and reports/api-play/ is removed.

## Evidence

Filled at landing: what ran and where its output is.
