---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: db
plan: test-enforcement
---

# A test compares every wire length limit with the table check on the column it writes

## What

The plugin storage wire schema allowed longer keys and larger values than the table's CHECK, so a value the schema admitted made the database throw an uncoded error. It was found by a reviewer, not by a check. tests/db/schema/enum-tuples.suite.test.ts already compares every contracts string tuple with every enum column by a dynamic census. The same shape fits length limits: for each column whose CHECK bounds a length, the contracts schema that writes it is at least as strict.

## Why

A wire schema looser than its column fails at the database with a raw error where a coded refusal belongs, and the two numbers live in different packages.

## Done when

A test in tests/db in the house pattern of the enum tuple suite reads the length checks from the drizzle schema and the limits from the contracts schemas that write those columns, by a mapping the schema files declare, and fails on a looser wire limit. It goes red when the plugin storage limit is loosened.

## Evidence

Filled at landing: what ran and where its output is.
