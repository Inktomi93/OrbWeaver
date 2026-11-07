---
kind: work
status: open
updated: 2026-11-07
priority: P3
area: tooling
plan: test-foundation
---

# State each rule's extent in one fast table

## What

Add the scope table, the ignore rows and the registered-rule run, and build home exemptions through a helper that refuses a glob. Group LK6 in the ledger triage, reports/codex-test-audit/ledger-triage.md, holds the rows, causes and the defect control that must go red first.

## Why

A widened exemption opens a hole in a security choke point, and today every lint test stays green through it.

## Done when

Widening the `scrubber-home` ignore to the substrate folder fails `tsc`. Adding `link-external-id.ts` to the `external-id-subject-binds` ignores fails a table row. Dropping `**/.claude/worktrees/**` fails a row. Mapping `derived-port-member` to a sibling rule fails the planted run. The file stays in-process and inside the default budget, or it is deleted.

## Evidence

Filled at landing: what ran and where its output is.
