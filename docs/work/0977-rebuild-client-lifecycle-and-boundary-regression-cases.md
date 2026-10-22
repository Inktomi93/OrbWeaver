---
kind: bug
status: open
updated: 2026-10-22
priority: P2
plan: test-foundation
---

# Rebuild client lifecycle and boundary regression cases

## What

Rebuild client regression cases for initial-read invalidation, PostEventSource subscription lifetimes, invalid auth-config inputs and data-list-header behavior through production entries.

## Why

Reference cases identify useful behavior but are outside the maintained test and compiler population.

## Done when

Each selected case has a maintained replacement with meaningful assertions and a failing production-defect control. Preserve strict parsing, subscription cleanup and real client composition.

## Evidence

Use the external reference cases for initial-read invalidation and PostEventSource only as case descriptions. Corpus producer, clone, search and cleanup qualification belongs to the corpus-lifetime work item.
