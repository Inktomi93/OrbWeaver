---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# Read the seed ledger table name from its schema in the accounts suite

## What

accounts.int.test.ts restates the user seed ledger table name as a literal.

## Why

A rename in the schema leaves the test reading a table that no longer exists.

## Done when

The test reads the table through the drizzle schema object or its production home.

## Evidence

Filled at landing: what ran and where its output is.
