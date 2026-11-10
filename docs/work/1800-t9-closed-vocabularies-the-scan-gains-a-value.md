---
kind: work
status: doing
updated: 2026-11-10
priority: P2
area: contracts
lane: wt/agent-a8de7b4cdde0d7872
plan: type-law
---

# T9 Closed vocabularies: the scan gains a value-set column, and string-typed kind, status and role fields with a closed set become tuple unions

## What

Turn each string-typed kind, status and role field that has a closed value set into a tuple-backed union. The scan half, a value-set column in pnpm brand-flow, is already written.

## Why

A field typed as a plain string accepts any spelling, so a wrong or new value compiles. The scan lists the fields and the literal values production code uses for each.

## Done when

Each field the scan lists with a closed value set is typed as a union from one tuple, and its dispatch is a total Record or ends in assertNever. The type-law rule for closed vocabularies is on at zero sites.

## Evidence

Scan half only. No field is changed. `pnpm brand-flow` writes `vocabularies` in `reports/brand-flow/brand-flow.json` and a "Closed vocabularies" table in `reports/brand-flow/brand-flow.md`.

The scan lists each string-typed field named `kind`, `status` or `role`, or ending in one of them. A field is a property typed `string`, or a zod field built from `z.string()`. For each field it lists the literal values seen in production code: object literal values, assignments, `===` and `!==` comparisons, and `case` labels. A value seen only in tests is listed apart. A field already typed as a literal union is not listed.

Production result: 62 fields (kind 26, status 19, role 17). 16 have a value seen, 9 of them two or more, for example `RpgQuestView.status` (active, completed, failed) and `CanonMessage.role` (assistant, system, user). 46 have none seen.

Floor: `pnpm test:tools tests/tooling/brand-flow`.
