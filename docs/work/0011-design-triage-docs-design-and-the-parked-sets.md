---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: docs
plan: doc-migration
---

# Design triage: docs/design and the parked sets become plans, ADRs or nothing

## What

For each of the flat files in `docs/design/` and each set in `docs/architecture/proposed/`: a live program becomes `docs/plans/<slug>/design.md` (`pnpm doc new plan`, then the prose moved in and cut to the plan sections and the 48 KiB cap); a landed program becomes an archived plan; a contested decision the file records becomes an ADR (`pnpm doc new adr`); a study, a mock set or a superseded draft is deleted. `docs/design/vocabulary-map.md` and `docs/design/gate-runtime-read-first.md` are law and move to `docs/law/`. Every citation of a moved or deleted file is rewritten or dropped in the same commit (314 code sites cite `docs/design/`); the `design` and `architecture-proposed` lanes leave `docs/catalog/lanes.json`; the `docs/architecture/proposed/INDEX.md` disposition table becomes the plan index.

## Why

The design drawer is flat and ticket-named; the parked sets carry rotten status lines. A plan has one shape and a checker.

## Done when

`docs/design/` and `docs/architecture/proposed/` are gone; `LEGACY_ROOTS` loses the `design` row (and `architecture` once the law and history items land); `pnpm check:structure` and `pnpm check:agents` are green.

## Evidence

Filled at landing: what ran and where its output is.
