---
kind: bug
status: open
updated: 2026-10-19
priority: P1
---

# lint:eslint-scoped reports clean on a named target the rule flags

## What

pnpm lint:eslint-scoped tooling/src/verify/lib/tenancy-direct-read.ts widened to a dependency-wide population and reported nothing for the named file, while orb/no-inline-union-alias fires at line 56 when ESLint runs on it directly. The scoped door returns a false clean for its own target. Several lanes today fell back to direct eslint because the door widened and truncated.

## Why

A lint door that says clean about the file you asked for is a lying instrument; every lane floor that trusts it can ship a finding.

## Done when

The door always reports the named targets' findings first and in full, or refuses loudly when it cannot; a planted finding in a named target turns it red, with a red-first test of the door.

## Evidence

Filled at landing: what ran and where its output is.
