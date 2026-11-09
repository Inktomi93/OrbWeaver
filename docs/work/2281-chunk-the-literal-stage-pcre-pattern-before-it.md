---
kind: tooling
status: open
updated: 2026-11-09
priority: P3
area: tooling
plan: unwired-code
---

# Chunk the literal-stage PCRE pattern before it outgrows the compiler

## What

The single git grep PCRE pattern fails to compile once the name list grows about four times past today's size; git then exits with an error and gitGrep throws.

## Why

The scan crashes outright once the dead-row population grows past the limit.

## Done when

The literal stage splits names into bounded patterns, and a fixture with more names than one pattern holds returns the same hits as the unsplit run.

## Evidence

Filled at landing: what ran and where its output is.
