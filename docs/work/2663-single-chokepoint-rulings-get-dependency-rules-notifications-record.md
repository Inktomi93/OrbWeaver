---
kind: tooling
status: doing
updated: 2026-11-12
priority: P3
lane: wt/agent-a672cae2c753c5fe3
plan: checked-law
---

# Single-chokepoint rulings get dependency rules: notifications.record, the settings store and the whole-blob settings writers

## What

The law names `notifications.record` and the settings key-value store as single chokepoints and names a whole-blob write guard for the settings writers, with no checker behind any of them. Every importer takes the tables by name through the `@orb/db` barrel, which dependency-cruiser cannot judge, so the checker is a row per table in `TABLE_IMPORT_RESTRICTIONS` in `tooling/src/eslint/security-policy.ts`, plus a persistence test for the write guard.

## Why

A chokepoint that nothing enforces gains a second caller without a failure.

## Done when

Each table has a restriction row on at zero with a planted control in `tests/tooling/eslint-table-import-bans.test.ts`, and a test through the composed services shows both settings writers refusing an unreadable stored blob and leaving its bytes, with a shown red.

## Evidence

Filled at landing: what ran and where its output is.
