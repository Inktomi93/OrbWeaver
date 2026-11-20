---
kind: tooling
status: open
updated: 2026-11-13
priority: P3
area: tests
plan: test-foundation
---

# The number bounds, veiled line and macro token count label functions have a wording test

## What

Component tests now call the number bounds label functions, the veiled line and label functions and the macro token count line to locate controls. No test asserts the words those functions produce.

## Why

A changed word in one of them passes every test that calls it.

## Done when

One node test per family asserts the output for each branch by its words, and fails when a word changes.

## Evidence

Filled at landing: what ran and where its output is.
