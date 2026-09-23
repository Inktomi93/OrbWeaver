---
kind: tooling
status: open
updated: 2026-09-23
priority: P2
area: verify
---

# Fail a test run that leaves files in the working tree

## What

Add a working-tree guard to every Vitest and Playwright run the verify stages start. Global setup
records `git status --porcelain --untracked-files=all` and the content hash of each file it lists.
Teardown compares the same view and fails the run when a file was added, changed or removed, naming each
path. Paths under `reports/` and other gitignored run output are exempt through `.gitignore`. The one
deliberate real-tree planter, `check-gates.repo.int.test.ts`, stays covered by the planted-fixture
observer. Name it as the guard's only exception, with the reason, in the guard itself.

## Why

Repo law says tests use in-memory overlays or temp directories and never write the working tree. Only
the shared helpers are known to follow it. Hundreds of file-write call sites in the test tree were never
classified. The planted-fixture observer (`tooling/src/verify/lib/planted-fixtures.ts`) only sees the
sentinel prefix of its one known planter, so a test that writes any other path in the repo passes
unseen.

## Done when

A planted test that writes a file into the working tree turns its suite red and names the file. The same
test writing into a `mkdtemp` directory stays green. Every suite in the push tier passes with the guard
on, and each real-tree writer it finds is fixed to use `scratch` or a temp directory.

## Evidence

Filled at landing: what ran and where its output is.
