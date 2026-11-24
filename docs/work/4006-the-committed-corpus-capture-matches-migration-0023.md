---
kind: bug
status: open
updated: 2026-11-24
priority: P1
area: tests
---

# The committed corpus capture matches migration 0023

## What

tests/support/node/corpus-fixture-freshness.int.test.ts fails on main: the committed corpus capture lags migration 0023_user-settings-schema-version-11 and drifts on table user_settings, since ecdf50c08e merged the migration without recapturing the corpus.

## Why

Every test that loads the corpus runs against a schema one migration behind production, and the freshness check is red on main.

## Done when

The corpus is recaptured through the house capture command against the shipped migration chain, the freshness test passes, and the corpus-backed suites pass.

## Evidence

Filled at landing: what ran and where its output is.
