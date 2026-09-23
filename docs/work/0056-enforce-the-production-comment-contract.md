---
kind: work
status: blocked
updated: 2026-09-23
priority: P2
area: tooling
blocked: wake gone docs/plans/doc-migration/design.md
---

# Enforce the production comment contract

## What

Production comments in `packages/*/src/**` follow the comment rules in
`.claude/rules/comments.md` and rule 6 of `.claude/rules/writing.md`. Keep useful TSDoc
on exported APIs. Keep comments that give a reason, a security rationale, a cross-file invariant or a
warning. Remove comments that narrate code, restate types, are stale, cite volatile coordinates, or compare
the code to other apps or older code. Rewrite a comparison as a present-tense constraint when its reason
still holds.

1. Add a syntax-aware gate over production source. It excludes generated, vendor, probe, fixture, migration
   and snapshot files. It holds volatile coordinates and comparisons to other apps at zero, and it stops
   comment density per package from growing.
2. Clean up in lanes split by package. Each lane reads every touched file in full and records a decision
   per comment. Deletion count is not a goal.

## Why

Nothing enforces the comment rules, so these comments come back. A comment can be the only record of a
cross-file constraint, so each removal needs a reason. This waits for the doc migration, because the
comment law moves and can change in it.

## Done when

The gate runs in `pnpm check` with a planted control in each direction. The zero classes have no findings.
A review confirms that the kept reasons, security notes and TSDoc survived. Behavior is unchanged.

## Evidence

Filled at landing: what ran and where its output is.
