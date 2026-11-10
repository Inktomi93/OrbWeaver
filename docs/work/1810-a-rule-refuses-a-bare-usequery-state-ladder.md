---
kind: work
status: doing
updated: 2026-11-10
priority: P2
area: client
lane: wt/agent-a866f791d38520b05
plan: type-law
---

# A rule refuses a bare useQuery state ladder in features outside the cited homes, once 1762's table is final

## What

Add a lint rule that refuses a hand-written useQuery state ladder (branching on loading, error and data by hand) in packages/client/src features outside the homes the law names (`QueryBoundary`, `useGatedQuery`, `useSuspenseQuery`).

## Why

The law line at docs/law/client-architecture-lockdown.md:44 bans a bare useQuery state ladder, but nothing enforces it: no rule in tooling/src/eslint or eslint.config.ts matches it. Items 1762 and 1815 (the table and the conversion of the remaining ladders) are landed, so the item is no longer waiting on them.

## Done when

The rule is on at error with no baseline, and the law line in docs/law/client-architecture-lockdown.md names it. A fixture with a bare ladder fails the rule, and a fixture in a cited home passes.

## Evidence

Landed blockers: 1762 in 9a487bcf60, 1815 in 59cdafb84d. The board field "blocked: on 1815" is stale.
