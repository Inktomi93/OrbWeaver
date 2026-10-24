---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: docs
---

# Fold the restoration register into law and remove the plan

## What

`pnpm doc drift` reports that the plan `docs/plans/restoration-register/design.md` has no open items. The register maps every legacy test file to the native case that replaced it, with the implementation and review briefs the rebuild lanes used. The drift rule says a finished plan moves what it taught into an ADR or law, then the plan is removed.

## Why

A plan with no open items is history that reads as current guidance. The disposition table and the brief standards are the parts worth keeping; the per-file rows are a record of a finished migration.

## Done when

The brief standards and the restoration policy the register states live in `docs/law/Spine-Testing.md` or an ADR, whichever rules them; the per-file disposition table is either dropped or kept as a report under `reports/`; every doc that links into the register (`AGENTS.md` test layout row, work items, `.claude` rules) points at the new home; `pnpm doc remove docs/plans/restoration-register/design.md` succeeds and `pnpm doc drift` is clean.

## Evidence

Filled at landing: what ran and where its output is.
