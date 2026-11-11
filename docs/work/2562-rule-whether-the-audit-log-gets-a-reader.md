---
kind: decision
status: open
updated: 2026-11-11
priority: P3
area: server
---

# Rule whether the audit log gets a reader

## What

The audit log table has many writers across the server domains and no reader anywhere in the app: no verb, route or screen reads it. Found by the gate lane while typing the table's metadata column; its census is in the lane report for the db checkers under reports/lanes.

## Why

A field or table nothing reads is a question about intent. Either it is a forensic record read with database tools, which should be stated, or an owner-facing audit view was meant and never built.

## Done when

Owner ruling: the audit log is a database-only forensic record. The table's header and the law say so and state its retention, and no reader is planned.

## Evidence

Filled at landing: what ran and where its output is.
