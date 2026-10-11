---
kind: bug
status: doing
updated: 2026-10-11
priority: P2
area: tooling
lane: wt/agent-a5b7abae5d1d0246f
---

# The commit hook catches what the whole-tree structure check refuses

## What

Four lane commits passed their pre-commit verify --static --changed staged and then failed main's whole-tree structure:full: a new CT with no source mirror (test-layout: dialog-glass-footer.ct.tsx from 854, stuck-splash.ct.tsx from 864) and an inline string-literal union alias (no-inline-union-redecl: VerdictKind from 854, PluginFailureKind from 858). The scoped structure run either does not include those gates or does not evaluate newly added files against them.

## Why

Each slip turns main red after a merge and costs a whole-tree check cycle to find; the staged hook is meant to catch exactly these per-file rules.

## Done when

A staged commit that adds a test file with no mirror, or an inline union alias of three or more members, fails the pre-commit hook; tests prove both with fixture commits; any gate that cannot run scoped is listed with why.

## Evidence

Filled at landing: what ran and where its output is.
