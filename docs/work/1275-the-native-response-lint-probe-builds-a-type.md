---
kind: tooling
status: open
updated: 2026-10-24
priority: P3
area: tooling
---

# The native response lint probe builds a type-aware program past its budget

## What

`tests/tooling/native-response-lint.int.test.ts` fails its `tests/server/infra/network/response-body.test.ts` case because building the type-aware ESLint program for the tests tree takes about 46 s against the registered `slow` budget of 30 s. The case is sound; the program it builds is the whole tests program when the probe needs one file's types.

## Why

A probe that outgrows its budget is red on every run and teaches nothing; a smaller program keeps the proof and the budget.

## Done when

The probe builds a program scoped to the file under test and its imports, or shares one program across the file's cases; the file passes within the registered budget on a loaded box with the measured duration in its header; no budget raise.

## Evidence

Filled at landing: what ran and where its output is.
