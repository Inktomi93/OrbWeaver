---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: db
plan: checked-law
---

# The schema text lint refuses a plain text column in every spelling, and a JSON column's NUL round trip is pinned

## What

The lint that makes a new text column use the NUL-free column type refuses a plain text call but misses the spelling that passes the text mode by name. Separately, JSON-mode columns were left on the plain type by rule, because a NUL inside JSON text is stored as an escape, and no test pins that round trip.

## Why

A column added in the missed spelling stores a raw NUL that reads back cut, and the rule that exempts JSON columns rests on a property nothing checks.

## Done when

The lint refuses the named-mode spelling with a row in its test. A test writes a string holding a NUL into a JSON-mode column, object and bare string both, and reads it back whole.

## Evidence

Filled at landing: what ran and where its output is.
