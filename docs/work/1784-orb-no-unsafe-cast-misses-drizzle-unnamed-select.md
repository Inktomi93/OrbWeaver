---
kind: tooling
status: open
updated: 2026-11-06
priority: P3
area: tooling
plan: test-enforcement
---

# orb/no-unsafe-cast misses Drizzle unnamed select types and exits 2 on plugin-sdk

## What

Make orb/no-unsafe-cast recognize Drizzle unnamed select result types, and stop it from exiting with code 2 when it lints packages/plugin-sdk.

## Why

The rule misses a cast of an unnamed Drizzle select type, so an unsafe cast passes. An exit code of 2 reads as a tool failure, not as a finding or a clean run.

## Done when

A fixture that casts an unnamed select result is reported. pnpm lint:eslint on packages/plugin-sdk exits with 0 or with findings, never with 2.

## Evidence

Filled at landing: what ran and where its output is.
