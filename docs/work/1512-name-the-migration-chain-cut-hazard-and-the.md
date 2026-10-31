---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: tests
plan: test-enforcement
---

# Name the migration-chain-cut hazard and the persistence tier boundary in the testkit README

## What

A test that runs production on a chain cut before a migration breaks when a later migration adds a column production reads (the 0005 marker test and the 0006 checkpoint test). Several suites under persistence/ boot the whole composed root and a plugin child. Record the rule for each in tests/support/README.md beside migrationsBefore and the rows door.

## Why

Both are recurring traps a cold author cannot see from the code.

## Done when

The README states both rules with the supported pattern for each, and the suites that break them follow it.

## Evidence

Filled at landing: what ran and where its output is.
