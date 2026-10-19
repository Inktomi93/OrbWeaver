---
kind: tooling
status: doing
updated: 2026-10-19
priority: P3
area: tooling
lane: wt/agent-acb14f15173490df8
plan: test-foundation
---

# byte-check-cast reads a tagged sql reached through a re-export

## What

taggedOrigin in tooling/src/floor/code-facts/drizzle-sql.ts falls back only to same-file merged callables, so a CHECK built with drizzle's sql tag reached through a sibling re-export is never judged by byte-check-cast.

## Why

A byte CHECK built that way escapes the gate.

## Done when

A mustFlag row for the re-export shape is red before the fix and green after.

## Evidence

Filled at landing: what ran and where its output is.
