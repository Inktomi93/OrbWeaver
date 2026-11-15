---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: ci
---

# The release notes job installs and compiles the whole workspace to edit release notes

## What

The `notes` job in `.github/workflows/release.yml` runs the shared setup action, whose install runs `scripts/prepare.ts` and compiles the router declarations, before it runs `scripts/ci/release-promotion.ts` and `gh`.

## Why

The compile is the slowest and most memory-hungry step of the job and the job needs none of its output. It is the step that failed the release on a small runner.

## Done when

The `notes` job runs the admission script without the router declaration compile, and the workflow tooling tests pass.

## Evidence

Filled at landing: what ran and where its output is.
