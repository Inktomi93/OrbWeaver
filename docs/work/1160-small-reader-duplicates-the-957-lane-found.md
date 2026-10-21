---
kind: work
status: blocked
updated: 2026-10-21
priority: P3
blocked: owner
---

# Small reader duplicates the 957 lane found

## What

verify/gates/package-deep-import.ts keeps its own package-path regex and a nextSpelling that repeats the codemod's planDeepImport decision; both could call floor packageFileOf. codemod findImportersOfFile and findAllReferencersOfFile run relation queries on the syntax-only project with no in-repo caller. findJsxByTag's doc says \<Foo.Bar/> matches Foo while the code matches Foo.Bar.

## Why

One home per concept, and a doc that contradicts its code is a defect.

## Done when

The gate uses packageFileOf and the codemod's spelling decision; the two unused relation queries are deleted or moved to the compiler worlds with a caller; the findJsxByTag doc matches the code.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
