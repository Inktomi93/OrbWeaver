---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: tests
plan: test-enforcement
---

# One testkit helper makes a test table exhaustive over a closed union

## What

Eight of nine refinery apply refusals had no server test, and the hole was only found by searching each union member across the test tree. The fix added a small type-level helper that fails the typecheck while a union member has no case, and names the missing member in the error. The rpg extraction registry got a second copy of the same helper. Other closed refusal and status unions in contracts have no such table.

## Why

A closed union makes coverage enumerable, and a helper with one home lets every refusal axis use it. Two copies already exist.

## Done when

The helper has one home in the testkit's iso world, the two existing copies use it, and a census lists each exported refusal or reason union in contracts with the test table that covers it or none. Each uncovered union is listed on the item for a follow-up, not fixed here.

## Evidence

Filled at landing: what ran and where its output is.
