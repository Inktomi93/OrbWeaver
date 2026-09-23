---
kind: tooling
status: open
updated: 2026-09-23
priority: P2
area: verify
plan: doc-migration
---

# A relative path inside a code span is checked by no gate

## What

Make the `check:agents` path check resolve a relative path written in a code span, such as
`../design/<name>.md`, against the file that contains it. Red when the target does not exist.

## Why

The ledger split moved rows from the legacy core registry to `docs/adr/`. Relative paths in code spans
then pointed nowhere, and every check stayed green. Today only link targets and repo-root paths are
checked.

## Done when

A planted relative code-span path to a missing file reds with its file and line. The same path to an
existing file passes. The real tree is clean.

## Evidence

Filled at landing: what ran and where its output is.
