---
kind: tooling
status: open
updated: 2026-11-20
priority: P2
area: ci
---

# A commit can pass CI and still be refused by the release command

## What

`pnpm release` runs checks that CI does not, such as the showcase `check:versions` script. The pre-push hook now runs that one, but nothing states that every release refusal is also a CI or pre-push failure.

## Why

A refusal after a green run costs a further commit, push and full CI run before the release can start.

## Done when

A tooling test fails when a release refusal exists only in the release command and not in the pre-push hook, or the reverse; the version check already runs in both.

## Evidence

Filled at landing: what ran and where its output is.
