---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: testing
plan: test-foundation
---

# The corpus workbench phone focus case holds when other corpus specs share its clone

## What

The phone case "entering Corpus from You lands focus in the finder, and the CONTEXT sheet takes focus" in `tests/e2e/corpus-workbench.spec.ts` failed its focus poll once when run after `tests/e2e/corpus-conversation.spec.ts` and `tests/e2e/corpus-home-launch.spec.ts` in one clone, and passes alone.

## Why

A spec that fails by run order makes the e2e verdict depend on scheduling.

## Done when

The cause is named (load or order), fixed there, and the three specs pass together on the phone project.

## Evidence

Filled at landing: what ran and where its output is.
