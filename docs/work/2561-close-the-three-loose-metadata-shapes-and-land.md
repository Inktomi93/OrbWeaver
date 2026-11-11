---
kind: tooling
status: open
updated: 2026-11-11
priority: P2
area: db
plan: checked-law
---

# Close the three loose metadata shapes and land the type-aware JSON column check

## What

The JSON column ruling in .claude/rules/db.md is held by a syntactic lint selector that a type alias defeats. A type test that walks every column's resolved type is written and catches each defeat, but it still names three columns: the metadata of personas, world entries and user credentials, each a loose object with an unknown index signature. Their schemas mark known fields with a plain optional, which infers an explicit undefined and clashes with the strict JSON type; the rest of contracts uses the exact-optional form for this (packages/contracts/src/chat/assemble.ts, portability/index.ts, plugin/snippet.ts). The persona write schema deliberately outputs an opaque record so every writer passes one narrowing function; that reason is a code comment, not a ledger ruling, and it holds with a JSON-typed output. Ruling: the JSON type stays strict and does not admit undefined. The parked test is in the gate lane's report for the db checkers under reports/lanes.

## Why

The check is not done until it is on at zero, and three columns can still hold a value that cannot be stored.

## Done when

The three metadata schemas use the exact-optional form for known fields and a JSON-typed remainder, every writer still passes the one narrowing function, and stored rows read as before with a test per shape. The type test lands at zero with planted controls for an alias, an interface, an untyped JSON column and a nested unknown, and the syntactic selector is removed if the type test covers it.

## Evidence

Filled at landing: what ran and where its output is.
