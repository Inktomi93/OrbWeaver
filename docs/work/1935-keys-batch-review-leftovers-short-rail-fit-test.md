---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: ui
plan: cross-surface-consistency
---

# Keys batch review leftovers: short-rail fit test and tight query spelling

## What

The short-rail resize test accepts a stale cut: assert the midline and which button is cut, on every phone and both legs. The query threshold rule misses a query written with no space after the at-keyword, because the parser reads it as a function node. client-architecture-lockdown.md does not mention that the rule binds bare media queries.

## Why

A test that cannot fail on a taller window proves nothing, and the rule should read every spelling.

## Done when

Deleting the rail observer fails the test on every phone, and the tight spelling reports.

## Evidence

Filled at landing: what ran and where its output is.
