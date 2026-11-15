---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
plan: typed-enforcers
---

# The directive-reason rule sees a blanket or self-naming disable

## What

`orb/disable-directive-reason` in `tooling/src/eslint/general.ts` reports a directive at the directive's own position, so a blanket `/* eslint-disable */` or a directive that names `orb/disable-directive-reason` suppresses the report about itself, and either can carry no reason.

## Why

A blanket disable is the widest suppression there is, and it is the one the reason rule cannot see.

## Done when

A blanket disable and a self-naming disable without a reason both fail lint, and `tests/tooling/eslint-disable-directive-reason.test.ts` holds a case for each.

## Evidence

Filled at landing: what ran and where its output is.
