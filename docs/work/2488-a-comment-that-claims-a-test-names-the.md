---
kind: work
status: doing
updated: 2026-11-11
priority: P3
area: docs
lane: wt/agent-a6f4f2c6b78ab727e
---

# A comment that claims a test names the test file

## What

A header in `packages/server/src/transport/trpc/contract/room-source.ts` says a contract test pins two tables against each other. No such test exists (item 2472). The citation test checks a path a comment names; it cannot check a claim that names no path. `.claude/rules/comments.md` does not require the path.

## Why

A promised test with no name cannot be found, so nobody learns it was never written.

## Done when

`.claude/rules/comments.md` requires a comment that claims a test, a lint rule or a check to name it by path or rule id. Comments under `packages/` and `tooling/src` that claim a test without naming one are found by a search for the claim wording and each is given the path, or the missing test is boarded, or the claim is removed.

## Evidence

Filled at landing: what ran and where its output is.
