---
kind: work
status: open
updated: 2026-11-07
priority: P2
area: tests
plan: test-foundation
---

# Judge every proof limit in the test audit ledger against the current tree

## What

The test audit recorded, for each current case, what it asserts, its production trace and what it does not prove. Only the findings were promoted. Read every ledger record in reports/codex-test-audit/behavior-index.csv, check each candidate gap against the current test and production source, and sort the real ones by root cause.

## Why

A test that proves something next to its claim passes while the behaviour breaks. The ledger names these gaps case by case, and nobody judged them.

## Done when

Every current record is read. Real gaps are filed by root cause as board items, each with the test and production path:line, and the rest are recorded as not a gap with the reason.

## Evidence

Filled at landing: what ran and where its output is.
