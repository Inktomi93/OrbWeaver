---
kind: bug
status: open
updated: 2026-10-18
priority: P2
area: tooling
plan: test-foundation
---

# Tooling tests fail with native type fact context is unavailable

## What

Several maintained tooling tests fail on main with factErrors drizzle-schema-data 'native type fact context is unavailable': the 'shared Drizzle fact health' group in tests/tooling/verify/gates/schema-fact-wave-1.suite.test.ts, and reviewed-grants.test.ts case 'four actual non-row execution identities'. Both reproduce on unmodified main bytes, as the 1016 and 1050 lanes showed.

## Why

A shared fact producer that cannot get its native type context gives these suites no verdict, so their health claims are unproven on main.

## Done when

Both suites pass on main because the fact context is supplied through the native owner, or the tests are corrected with evidence that they now exercise the real producer.

## Evidence

Filled at landing: what ran and where its output is.
