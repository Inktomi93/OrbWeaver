---
kind: tooling
status: doing
updated: 2026-11-12
priority: P3
lane: wt/agent-a672cae2c753c5fe3
plan: checked-law
---

# The release-please config test demands patch holds in the dev container's npm block

## What

`tests/tooling/release-please-config.int.test.ts` requires every npm Dependabot block in `.github/dependabot.yml` to ignore every patched dependency. The dev container tools block has its own lockfile and no libsql, so the case fails on main. `tests/tooling/dependabot-patched-ignores.test.ts` already owns the same fact with the right scope and passes.

## Why

The test is red on main and is outside the pre-push list, so nothing runs it and its failure hides.

## Done when

One test owns patch holds, scoped to the npm blocks that resolve the workspace lockfile, and it passes on main.

## Evidence

Filled at landing: what ran and where its output is.
