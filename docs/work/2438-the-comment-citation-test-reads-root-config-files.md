---
kind: tooling
status: doing
updated: 2026-11-11
priority: P2
area: tooling
lane: wt/agent-a3b00fac426662467
---

# The comment citation test reads root config files and scripts

## What

`tests/tooling/doc/comment-path-citations.repo.int.test.ts` scans only `packages`, `tooling` and `tests`, so a comment in a root config file or under `scripts/` can cite a deleted path. Source: `reports/codebase-review/units/root-config.md`.

## Why

The dead test paths in `pnpm-workspace.yaml` stood because no check read that file.

## Done when

The test scans the root config files and `scripts/`, a planted dead cite in each turns it red, and the tree passes.

## Evidence

Filled at landing: what ran and where its output is.
