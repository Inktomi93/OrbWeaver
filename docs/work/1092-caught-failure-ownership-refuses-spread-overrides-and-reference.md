---
kind: tooling
status: open
updated: 2026-10-19
priority: P3
area: tooling
plan: test-foundation
---

# Caught-failure ownership refuses spread overrides and reference-only carriers

## What

A factory body can override ok:false through a spread such as {ok:false, ...v}, and a call that only references the binding, such as wrap(void err), counts as carrying it.

## Why

Both can credit an owner that does not keep the failure.

## Done when

Each shape has a mustFlag row that is red before the fix and green after.

## Evidence

Filled at landing: what ran and where its output is.
