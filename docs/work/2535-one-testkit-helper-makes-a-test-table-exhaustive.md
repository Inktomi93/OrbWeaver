---
kind: tooling
status: open
updated: 2026-11-13
priority: P3
area: tests
plan: test-enforcement
---

# One testkit helper makes a test table exhaustive over a closed union

## What

A type-level helper that forces a table to name every member of a union is written three times: `everyPlane` in `packages/contracts/src/rpg/extraction-prompt.ts`, `everyReason` in `tests/server/domain/refinery/verbs/apply-refusals.int.test.ts` and a third in the tone variant matrix stories under `tests/ui/primitives/`. One copy is production code in the contracts package, which cannot import the testkit, so the helper's one home is the kit package and all three import it. Then census the closed refusal and reason unions in the contracts package against the tests that walk them.

## Why

A closed union makes coverage enumerable, and a helper with one home lets every refusal axis use it. Two copies already exist.

## Done when

The helper has one home in the kit package, the three copies import it, and each refusal or reason union in the contracts package with no test that walks its tuple is listed on this item or has its own item.

## Evidence

Filled at landing: what ran and where its output is.
