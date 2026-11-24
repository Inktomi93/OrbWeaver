---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-a55b68996211c3372
plan: unwired-code
---

# Coverage matches a hit's branches when its line holds a different number of branches

## What

The recorded CT run leaves branches unmatched in the coverage merge where the browser build's line holds a different number of branches than the source line, for example class-merge.ts binary expressions and the button core component. tooling/src/unwired/coverage-merge.ts matches branches by position on the line.

## Why

An unmatched branch can never read as executed, so a live branch reads as dead.

## Done when

A targeted CT coverage run shows no unmatched branch, or each branch left has a named cause, and a red-first planted case covers a line whose branch count differs between source and build.

## Evidence

Filled at landing: what ran and where its output is.
