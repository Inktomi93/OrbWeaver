---
kind: tooling
status: doing
updated: 2026-11-10
priority: P3
area: testing
lane: wt/agent-aecd4bf3e1ec1baab
plan: test-foundation
---

# Type-law closeout follow-ups from the final review

## What

From the cb-typelaw review in reports/code-reviewer: orb/no-query-state-ladder does not judge a destructure of a copied result, a switch on status, branches that return a call or assign a variable, deep presence, isFetching or useQueries read by index; no CT holds then fails the reads moved under a boundary (the character context band, corpus browse, snapshot compare) and CorpusBrowseView has no CT; the empty-label guard does not reach createElement calls; the verdict CT asserts only that the raw spelling never shows, because tests have no import path to the display word; the accept-review chips moved off micro caps without a rendered review.

## Why

Each is a gap between what the type-law rules claim and what a test proves.

## Done when

Each gap gets a fixture or CT that fails without the guarded behaviour, or a recorded reason in the rule's TSDoc, and a rendered review judges the accept-review chips.

## Evidence

Filled at landing: what ran and where its output is.
