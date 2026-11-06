---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: client
blocked: on 1815
plan: type-law
---

# A rule refuses a bare useQuery state ladder in features outside the cited homes, once 1762's table is final

## What

Add a lint rule that refuses a hand-written useQuery state ladder in features outside the cited homes, once the table in item 1762 is final.

## Why

A feature that branches by hand on a query's loading, error and data states drifts from the shared handling that the other features use.

## Done when

The rule is on at error with no baseline, and the law line in docs/law/client-architecture-lockdown.md names it. A fixture with a bare ladder fails the rule, and a fixture in a cited home passes.

## Evidence

Filled at landing: what ran and where its output is.

Done when the rule is on at error with no baseline, and the law line at `docs/law/client-architecture-lockdown.md:44` names it.
