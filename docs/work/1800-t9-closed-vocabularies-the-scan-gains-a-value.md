---
kind: work
status: open
updated: 2026-11-01
priority: P2
area: contracts
plan: type-law
---

# T9 Closed vocabularies: the scan gains a value-set column, and string-typed kind, status and role fields with a closed set become tuple unions

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Scan half only. No field is changed. `pnpm brand-flow` writes `vocabularies` in `reports/brand-flow/brand-flow.json` and a "Closed vocabularies" table in `reports/brand-flow/brand-flow.md`.

The scan lists each string-typed field named `kind`, `status` or `role`, or ending in one of them. A field is a property typed `string`, or a zod field built from `z.string()`. For each field it lists the literal values seen in production code: object literal values, assignments, `===` and `!==` comparisons, and `case` labels. A value seen only in tests is listed apart. A field already typed as a literal union is not listed.

Production result: 62 fields (kind 26, status 19, role 17). 16 have a value seen, 9 of them two or more, for example `RpgQuestView.status` (active, completed, failed) and `CanonMessage.role` (assistant, system, user). 46 have none seen.

Floor: `pnpm test:tools tests/tooling/brand-flow`.
