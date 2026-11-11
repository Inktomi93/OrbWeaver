---
kind: tooling
status: open
updated: 2026-11-11
priority: P2
area: tooling
---

# The fast repository checks run before a push

## What

The doc check test `tests/tooling/doc/ops/check.int.test.ts` was red on main and nobody saw it, because `pnpm test:tools` runs in neither the pre-push hook nor CI. The owner ruled that tooling tests stay out of CI. Recommendation, awaiting the owner's yes: add a short named list of fast repository-integrity test files to the `pre-push` block of `lefthook.yml`: the doc check, `tests/tooling/doc/comment-path-citations.repo.int.test.ts`, `tests/tooling/container-security-config.int.test.ts`, and the Dependabot and workflow agreement tests under `tests/tooling/`.

## Why

A check that nobody runs enforces nothing, and each of these catches a drift that no compiler or lint sees.

## Done when

The owner has ruled. On yes: one pre-push command runs the named files, it finishes in seconds on the owner's machine, the list has one home, and main passes it. On no: the item records the ruling and closes.

## Evidence

Filled at landing: what ran and where its output is.
