---
kind: work
status: doing
updated: 2026-11-11
priority: P2
area: tooling
lane: wt/agent-a30ee1d42d1997dfe
---

# The review harness's direct edits to tracked files are reviewed

## What

The codebase review was meant to log findings only, but its commits also edited tracked files outside the review folder: comments in root config files, `Dockerfile`, the docker and dev scripts, two worktree hooks, `AGENTS.md`, `vitest.config.ts`, `knip.ts`, `platform.d.ts`, two tsconfig files, one codemod manifest, one tooling test, and comments in `packages/kit`, `packages/contracts` and `packages/server/src/foundation`. `reports/codebase-review/harness-commits.txt` lists the commits. One edit was already found wrong and corrected (the grep line in `AGENTS.md`), and one left an authorization exemption citing two rulings (item 2452). None of the rest has had an independent read.

## Why

An unreviewed edit to a comment that states a security or scoping ruling can make the comment false with no test turning red.

## Done when

A code-reviewer has read every hunk those commits made outside the review folder and returned a verdict per file. Each wrong or unsupported edit is reverted or corrected, and each one that changes a cited ruling is checked against the ledger.

## Evidence

Filled at landing: what ran and where its output is.
