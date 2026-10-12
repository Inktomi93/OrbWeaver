---
kind: work
status: blocked
updated: 2026-10-12
priority: P3
area: tests
blocked: on 961
plan: test-mirror
---

# Test files over the size cap are split by behaviour

## What

Item 899 added test-file-size (cap 1000 lines) and baselined every file over it as a reviewed grant pointing at the plan. Split each into behaviour-named suites in its mirrored directory as lanes touch the area, deleting the grant row each time.

## Why

Monolith test files hide which behaviour broke and resist the directory mirror.

## Done when

The test-file-size grant list is empty.

## Evidence

The branch wt/agent-a17af7753ef5674e8 split a first batch with equal case counts. The remaining files leave through the test-foundation legacy ledger (item 961) rather than being split, because the rebuild replaces them.

Filled at landing: what ran and where its output is.
