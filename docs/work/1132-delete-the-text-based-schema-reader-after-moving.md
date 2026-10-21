---
kind: work
status: blocked
updated: 2026-10-21
priority: P3
blocked: owner
---

# Delete the text-based schema reader after moving its cases

## What

tooling/src/floor/code-facts/schema-read.ts is a second, text-based schema reader with no production consumer. Its importers are its own test, a tooling/package.json exports entry and a row in docs/law/Core-Tooling-Law\.md. Its test cases (imported, spread, shorthand and computed columns, and the refusals) should move onto schemaFromCorpus first.

## Why

One home per concept: a second schema reader with no consumer can drift and mislead the next author.

## Done when

The cases run against schemaFromCorpus, schema-read.ts, its export entry and its law row are deleted in one commit, and the moved cases pass.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
