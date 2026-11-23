---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: db
---

# A schema_version column carries no default that tracks a version constant

## What

user_settings.schema_version defaults to USER_SETTINGS_SCHEMA_VERSION and presets.schema_version to PROMPT_CONFIG_SCHEMA_VERSION (packages/db/src/schema/settings.ts and preset.ts). Every version bump changes the DDL and needs a table-rebuild migration.

## Why

A settings version bump shipped without a migration and turned main red. Every writer already states the version, so the default is a backstop nothing needs.

## Done when

Both columns are integer schema_version, not null, with no default, carried by the next rebuild of each table; every insert states the version, which tsc requires once the default goes.

## Evidence

Filled at landing: what ran and where its output is.
