---
kind: bug
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# A write through an untyped lift chain reaches its schema member

## What

userSettingsSchema.schemaVersion is read through Object.entries(DEFAULT_USER_SETTINGS) at export-st-profile.ts, but every write goes through the zod default or the untyped lift chain in packages/contracts/src/settings/index.ts. The graph sees no typed write and reports it member-read-only.

## Why

A live version stamp reads as never written.

## Done when

A planted zod default and lift-chain write credits the member; the case fails without the change.

## Evidence

Filled at landing: what ran and where its output is.
