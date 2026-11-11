---
kind: tooling
status: doing
updated: 2026-11-11
priority: P2
area: tooling
lane: wt/agent-a672cae2c753c5fe3
plan: checked-law
---

# A lint rule refuses a catch that answers null or nothing for every error in server source

## What

The review-fix work found the same defect in the search space resolver, the embeddings resolve op and the stale-generation scan: a catch with no binding, or one that ignores its binding, that returns null for any thrown error. Each turned a database fault or a programming error into a modeled refusal and hid it from the log. The repair in each place was a predicate on the error's class. Nothing stops the next one. A native ESLint no-restricted-syntax entry can refuse a catch clause in packages/server/src whose body returns null, undefined or nothing without reading the caught error.

## Why

A swallowed error is invisible until someone traces a wrong answer back to it. The fix is always the same shape, so the rule has a clear message: decide by the error's class or rethrow.

## Done when

The entry is composed into the server block's no-restricted-syntax list with a planted test like its sibling rule tests. A census of the sites it flags is taken first with a structural search of both languages; each is narrowed to a class predicate or shown to read the error, and the rule lands at zero with no suppression.

## Evidence

Filled at landing: what ran and where its output is.
