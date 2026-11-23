---
kind: bug
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# A method-syntax callback parameter carries its value into the generic

## What

graph/variance.ts counts a method or constructor parameter for nothing. An Options<V> whose callback is written as a method, mutationFn?(vars: V), therefore pairs V forward, and the router input's keys report write-only (NominateVars.chatId, .offer). Map.set through a wider instance shows the same. The tree's own generics have no method-shaped members today; library .d.ts files were not surveyed. The 3922 and 3936 code review under reports/code-reviewer/ holds the probes.

## Why

A wrong pairing direction makes a live member look dead, which is a false delete proposal.

## Done when

A method-syntax callback parameter flips polarity without making library collections invariant (includes, indexOf, reduce initialValue stay as now); planted method-callback and Map.set cases credit the writes; each fails without the change.

## Evidence

Filled at landing: what ran and where its output is.
