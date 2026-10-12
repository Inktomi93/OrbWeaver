---
kind: tooling
status: open
updated: 2026-10-12
priority: P2
plan: test-foundation
---

# Adopt the ESLint plugins that replace custom test, zod and suppression gates

## What

Add eslint-plugin-playwright, @vitest/eslint-plugin, eslint-plugin-zod, @eslint-community/eslint-plugin-eslint-comments, eslint-plugin-regexp and eslint-plugin-drizzle through the catalog. For each custom gate a plugin rule covers (ct-no-oneshot-live-read-assert, ct-poll-schedule-and-paint, test-no-stubs, zod-modern-spellings, no-blanket-suppression and the overlapping parts of test-fixture-imports, test-mock-doctrine, suppressions and zod-error-issues-home), prove the rule flags every site the gate flags, re-judge each old waiver (fix, real home, or deferred), then delete the gate, its tests and its rows.

## Why

A maintained plugin rule is cheaper than a custom gate with its own proof machinery, and several plugins catch bugs no gate does (ReDoS, unscoped drizzle deletes).

## Done when

Each plugin is configured on its population; each overlapped gate is deleted with equivalence evidence; no inline suppression replaces a waiver.

## Evidence

Filled at landing: what ran and where its output is.
