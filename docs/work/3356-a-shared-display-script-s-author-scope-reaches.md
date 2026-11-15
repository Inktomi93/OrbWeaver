---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: regex
plan: import-robustness
---

# A shared display script's author scope reaches members with ids of people not in the room

## What

A shared script entry sends its author selectors to members as stored. A probe delivered the id of a user who is not seated in the room.

## Why

A member learns an account id the room never showed them.

## Done when

Selectors sent to a member name only seated people, or the scope is resolved on the server, proven with a member-principal case.

## Evidence

Filled at landing: what ran and where its output is.
