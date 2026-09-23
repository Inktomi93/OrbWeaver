---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: docs
plan: doc-migration
---

# Clear the writing-rule findings in the moved law docs

## What

After item 0005 moves the legacy core law folder into `docs/law/`, clear its writing-rule findings (dates, issue numbers, history words, banned words) with the same workflow as the ADR cleanup: Sonnet rewrites, and Opus checks each file against its original for lost meaning. Keep a file at full length rather than lose a rule.

## Why

The move ends the legacy exemption, so the law tree carries hundreds of prose findings.

## Done when

`pnpm check:agents` reports no writing-rule finding under `docs/law/`, and no rule, value or pointer was lost (an Opus check per file).

## Evidence

Filled at landing: what ran and where its output is.
