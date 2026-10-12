---
kind: adr
status: active
updated: 2026-10-12
supersedes: docs/adr/0274-the-commit-gate-runs-only-what-narrows-to-the-staged-files.md
---

# Commit runs Biome and typecheck; CI is the verdict

## Context

CI qualifies every push to main and every pull request: the static job runs the whole application static tier, the node and ct jobs run every product test in shards, and e2e smoke runs the real stack. Nightly runs full verification and weekly runs tooling proof. The commit hook still ran most of the static tier over the staged change, so every commit and every lane paid again for checks CI already owns.

## Decision

Pre-commit and pre-merge-commit run Biome and the native typecheck over the staged change, plus the commit-message check, by owner ruling. The typecheck runs every native program whose import closure holds a staged file; a deleted file selects every program. ESLint, dependency-cruiser and the structure walk do not run at commit.

CI is the verdict for done. Its static, node, ct and e2e-smoke jobs are the core every push must pass: the compiler programs and world purity, import and tier direction, lint, structure, runner membership, contracts, schema and data safety, persistence and tenancy, and the running app. Nightly full verification and weekly tooling proof keep their schedules (D307).

The orchestrator runs `pnpm check --application` once on main before the owner pushes, not after each merge train. A lane runs the tests named for its change and a typecheck of its affected programs.

Homes: `lefthook.yml`, `tooling/src/verify/lib/selection.ts`, `.github/workflows/ci.yml`, `.claude/skills/orchestrator/SKILL.md` and `docs/law/UNIFIED-VERIFICATION-DESIGN.md` section 4.

## Consequences

A commit costs seconds plus the typecheck of its programs. A structure, depcruise or ESLint red now surfaces at the pre-push check or in CI, not at commit, and is fixed forward on main.

## Alternatives rejected

Keep the whole static tier at commit: rejected, because it repeats the CI static job on every commit. Drop the typecheck from the hook too: rejected by the owner, because it is fast and catches most breakage at the source. A merge-train branch with CI as the barrier: rejected, because work lands on local main and the owner pushes in batches.
