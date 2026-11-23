---
kind: bug
status: open
updated: 2026-11-23
priority: P1
area: db
---

# The user_settings schema_version default ships in a numbered migration

## What

USER_SETTINGS_SCHEMA_VERSION became 11 (packages/contracts/src/settings/index.ts), and packages/db/src/schema/settings.ts uses it as the schema_version column default, so the live DDL default is 11 while the newest migration snapshot holds 10. No numbered migration carries the change. tests/db/migrations/schema-snapshot.int.test.ts fails both cases; its diff also lists a users table difference to explain.

## Why

A schema change without a migration leaves installed databases on the old default, and CI's Node job is red on it.

## Done when

A numbered migration and snapshot carry the new default and any users difference the test names; schema-snapshot.int.test.ts passes; no baseline is regenerated.

## Evidence

Filled at landing: what ran and where its output is.
