---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: security
plan: authorization-and-visibility
---

# The import, export and settings ESLint blocks keep the visibility minter restriction

## What

Three ESLint config blocks in eslint.config.ts, for import, export and settings, drop the restriction that refuses the viewer visibility minter. Dependency-cruiser still refuses the import.

## Why

Two guards for one rule should agree, so the lint guard catches the import in the editor before dependency-cruiser runs.

## Done when

Every ESLint block that applies to server domain files keeps the minter restriction, and a fixture import in one of those blocks is refused by ESLint.

## Evidence

Filled at landing: what ran and where its output is.
