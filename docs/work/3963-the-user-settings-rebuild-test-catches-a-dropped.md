---
kind: work
status: open
updated: 2026-11-23
priority: P3
area: db
plan: test-foundation
---

# The user_settings rebuild test catches a dropped foreign key

## What

tests/db/schema/user-settings-schema-version-11.repo.int.test.ts stays green when the FOREIGN KEY clause is removed from the user_settings rebuild migration: its fresh-shape check runs the same chain on both sides, and its referential-integrity check finds nothing to check once the key is gone.

## Why

A rebuild that loses the key to users would leave settings rows behind when a user is deleted, and no test would notice.

## Done when

The test compares the table's foreign key list against a literal, or deletes the owning user and asserts the settings row goes, and it turns red with the clause removed from the migration.

## Evidence

Filled at landing: what ran and where its output is.
