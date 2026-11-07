---
kind: bug
status: open
updated: 2026-11-07
priority: P3
area: server
plan: test-foundation
---

# insertImageSkip selects from its parent like the other vector writes

## What

insertImageSkip keeps the foreign key shape the vector upserts just left, on a small window. Select from the parent so a vanished row inserts nothing.

## Why

The same failure lands in a detached subscriber and pollutes the error ring.

## Done when

A deleted parent during the write inserts nothing and logs no error, with a test.

## Evidence

Filled at landing: what ran and where its output is.
