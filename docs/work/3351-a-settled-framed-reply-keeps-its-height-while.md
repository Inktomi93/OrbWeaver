---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
plan: import-robustness
---

# A settled framed reply keeps its height while the next reply streams

## What

In one observed run the previous reply's frame shrank and cut its text mid-sentence until the new reply settled.

## Why

The reader loses the end of the reply they were reading.

## Done when

A CT streams a reply under a settled framed reply and the settled frame's height does not change.

## Evidence

Filled at landing: what ran and where its output is.
