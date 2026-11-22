---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# A delete trial confirms each graph candidate

## What

The graph proposes dead declarations and members but nothing checks that removing one compiles. reports/api-play/whatif.ts showed runWithTemporaryFileUpdate removing a member in a throwaway snapshot and diffing semantic diagnostics.

## Why

3882 names the delete trial; an error after a removal is a reader the graph missed.

## Done when

graph-trial removes each candidate of the named buckets in a temporary snapshot, checks only the importing files, and reports confirmed candidates and each refuting error by file and line; a planted refuting case names its reader; the real-tree counts are in the item evidence. As a control, Program.getSuggestionDiagnostics diagnostics marked reportsUnnecessary are diffed against the graph dead locals and private members, and every disagreement is listed.

## Evidence

Filled at landing: what ran and where its output is.
