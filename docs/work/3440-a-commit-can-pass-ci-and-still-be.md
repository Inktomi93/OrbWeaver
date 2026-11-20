---
kind: tooling
status: open
updated: 2026-11-15
priority: P2
area: ci
---

# A commit can pass CI and still be refused by the release command

## What

`pnpm release` runs checks that CI does not, such as the showcase `check:versions` script. The pre-push hook now runs that one, but nothing states that every release refusal is also a CI or pre-push failure.

## Why

A refusal after a green run costs a further commit, push and full CI run before the release can start.

## Done when

Every check `pnpm release` can refuse on, other than a dirty tree and the CI status itself, runs in pre-push or CI. A tooling test compares the release command's check list with the hook and workflow and fails on a check that only the release runs.

## Evidence

Filled at landing: what ran and where its output is.
