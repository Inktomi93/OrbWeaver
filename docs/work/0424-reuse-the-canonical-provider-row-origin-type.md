---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: connection
---

# Reuse the canonical provider row origin type

## What

Type the provider persistence writer origin with ProviderRowOrigin from the DB package instead of repeating its union.

## Why

The DB schema owns PROVIDER_ROW_ORIGINS and its derived type. The writer repeats the same vocabulary and can drift independently.

## Done when

Use the existing exported type in valuesOf. Preserve provider ownership, claims, origin values and schema. Run affected type checks and existing provider persistence tests. No migration or gate expansion is required.

## Evidence

Source audit: `/tmp/claude-launch-db-audit/RESULTS.md`. The canonical tuple and type are in `packages/db/src/schema/connection-bindings.ts`; `packages/server/src/domain/connection/persistence/provider-rows.ts` repeats the union in `valuesOf`. Root confirmed both declarations. Implementation and affected checks remain pending.
