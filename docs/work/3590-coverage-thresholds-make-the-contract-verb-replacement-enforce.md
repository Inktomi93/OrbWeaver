---
kind: tooling
status: open
updated: 2026-11-20
priority: P3
area: tooling
---

# Coverage thresholds make the contract-verb replacement enforce

## What

`vitest.config.ts:117-124` turns on V8 coverage with no thresholds, so the ruling that coverage replaced contract-verb presence asserts nothing. Set thresholds that fail on a domain verb no server test executes, or amend the ruling.

## Why

A verb with no test passes every check while the ruling says it cannot.

## Done when

A verb with no executing server test fails the run, or the ruling states what replaces the check.

## Evidence

Filled at landing: what ran and where its output is.
