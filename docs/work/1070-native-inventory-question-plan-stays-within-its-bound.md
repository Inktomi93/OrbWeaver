---
kind: tooling
status: open
updated: 2026-10-19
priority: P1
area: tooling
plan: test-foundation
---

# Native inventory question plan stays within its bound on the db program

## What

schemaTypeQuestions in tooling/src/floor/code-facts/ordinary-observations.ts plans every typed column against every call in the program and every override property. On packages/db/tsconfig.json the selector Map exceeds its maximum size, the native inventory worker dies, and structure:full reports tool errors for every dependent policy.

## Why

No structure verdict exists on main while the worker dies, so the barrier cannot qualify a push.

## Done when

Column questions are planned only for calls that can bind the column, a red-first test bounds the plan size on the real db program, and structure:full completes on main without inventory tool errors.

## Evidence

Filled at landing: what ran and where its output is.
