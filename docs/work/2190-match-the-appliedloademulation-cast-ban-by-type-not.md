---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# Match the AppliedLoadEmulation cast ban by type, not spelling

## What

The cast ban in eslint.config.ts matches only the literal type name, so a local alias, a qualified name or an import type spelling of AppliedLoadEmulation passes.

## Why

The ban is dodged by renaming the type.

## Done when

Each of the three spellings is refused by a plant row, or the ban moves to a typed rule that resolves the target type.

## Evidence

Filled at landing: what ran and where its output is.
