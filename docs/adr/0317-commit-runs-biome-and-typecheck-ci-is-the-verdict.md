---
kind: adr
status: active
updated: 2026-10-12
supersedes: docs/adr/0274-the-commit-gate-runs-only-what-narrows-to-the-staged-files.md
---

# Commit checks staged files; push checks native lint and dependencies

## Context

Contributors need fast commits and a clean lint and dependency result before publishing changes.

## Decision

Pre-commit and pre-merge-commit run Biome on staged files and reject errors or warnings. The commit-message hook checks message format.

Pre-push checks GitHub synchronization, full Biome, dependency-cruiser and full ESLint, in that order. Run these commands sequentially and stop on failure. ESLint includes the retained custom rules. Use native commands directly; do not introduce another verification wrapper.

Run affected native compiler programs and behavioral tests during implementation. CI runs complete application static checks, Node tests, component tests and E2E smoke. Release approval remains subject to CI.

Homes: `lefthook.yml`, `package.json`, `.github/workflows/ci.yml` and `.claude/skills/orchestrator/SKILL.md`.

## Consequences

Ordinary commits avoid full-tree semantic lint. Pushes pay for the full native lint and dependency checks without concurrent compiler graphs.

Local lint success does not establish complete application runtime acceptance. Read CI results before release.

## Alternatives rejected

Whole-tree ESLint on every commit repeats expensive work during editing. A custom check runner adds machinery where native commands suffice.
