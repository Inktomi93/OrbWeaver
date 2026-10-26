---
kind: tooling
status: doing
updated: 2026-10-26
priority: P2
area: tooling
lane: main
---

# Keep Snap default appearance profile aligned with schema defaults

## What

Remove drift between the Snap defaults appearance profile and appearanceSettingsSchema. The profile declares avatarSize md while schema parsing yields lg; new schema axes can also retain account values if omitted from the profile.

## Why

A capture labelled defaults can differ from a new account and mislead design decisions.

## Done when

The defaults drive derives or verifies every relevant schema default while preserving intentionally retained user content. Add a meaningful mismatch control and verify the actual shim. Do not change product defaults to match stale tooling.

## Evidence

Snap derives its default profile from the production appearance schema while retaining the uploaded background inventory.
The production response-patching tests, archive source-census tests and existing custom-property ESLint tests pass.
Independent review confirms the schema-derived profile and source-archive census. Compiler checks pass; live corrected captures apply explicit schema defaults.
The [implementation review](../reviews/composer-implementation-review.md) distinguishes settled visual evidence from the preserved cold-navigation failure.
