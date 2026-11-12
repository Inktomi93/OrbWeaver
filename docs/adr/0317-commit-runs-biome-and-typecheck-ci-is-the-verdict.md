---
kind: adr
status: active
updated: 2026-11-12
supersedes: docs/adr/0274-the-commit-gate-runs-only-what-narrows-to-the-staged-files.md
---

# Commit checks staged files; push checks native lint and dependencies

## Context

Contributors need fast commits and a clean lint and dependency result before publishing changes.

## Decision

Pre-commit and pre-merge-commit run Biome on staged files and reject errors or warnings. The commit-message hook checks message format.

Pre-push checks GitHub synchronization, full Biome, dependency-cruiser, full ESLint, both knip views, the full typecheck and the repository integrity tests listed in `lefthook.yml`, in that order. Those tests hold law, rule and comment citations, the doc check, the container security config, the workflow and Dependabot agreements, and the ESLint parts' agreement with CI and coverage of the tree true; the other tests under `tests/tooling` stay hand-run. A merge can combine two clean branches into a tree that does not compile, so the push checks the whole compiler graph. Run these commands sequentially and stop on failure. ESLint includes the retained custom rules. Use native commands directly; do not introduce another verification wrapper.

Full ESLint is the one split command. One ESLint process over the whole tree peaks past the memory bar, so `pnpm lint:eslint:parts` lints the parts `scripts/eslint-parts.ts` lists, one process after another, each with the default heap. The CI `eslint` matrix runs the same parts as separate jobs. A part that outgrows the bar is split into smaller parts; it is never given a larger heap.

The memory bar: one run's peak stays under 16 GB. A part's peak may grow while it stays under the bar. Raising a heap limit is refused.

Run affected native compiler programs and behavioral tests during implementation. CI runs complete application static checks, Node tests, component tests and E2E smoke. Release approval remains subject to CI.

Homes: `lefthook.yml`, `package.json`, `scripts/eslint-parts.ts`, `.github/workflows/ci.yml` and `.claude/skills/orchestrator/SKILL.md`.

## Consequences

Ordinary commits avoid full-tree semantic lint. Pushes pay for the full native lint, dependency and compiler checks, run one after another.

Local lint success does not establish complete application runtime acceptance. Read CI results before release.

## Alternatives rejected

Whole-tree ESLint on every commit repeats expensive work during editing. A custom check runner adds machinery where native commands suffice.
