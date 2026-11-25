---
kind: work
status: open
updated: 2026-11-25
priority: P3
area: db
plan: test-foundation
---

# plugins.widened_changed_provider_ids carries a CHECK like its sibling widened columns

## What

The widened_changed_provider_ids column on plugins (packages/db/src/schema/plugin.ts) has no CHECK, while its sibling widened columns are held by plugins_widened_reach_check. Nothing in the schema keeps it a subset of widened_provider_ids or a JSON array.

## Why

The upgrade check keeps the column consistent today, but the schema does not, and a later writer could store ids the re-consent never asked about.

## Done when

A numbered migration adds the CHECK (subset of widened_provider_ids, JSON array), or the schema comment records why the table rebuild it needs is not worth it, and a db test refuses a row that breaks it.

## Evidence

Filled at landing: what ran and where its output is.
