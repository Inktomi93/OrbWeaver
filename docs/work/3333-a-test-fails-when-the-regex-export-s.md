---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: regex
plan: import-robustness
---

# A test fails when the regex export's ownership filter is removed

## What

The backup export reads only the caller's own regex scripts. The backup round-trip suite on the import branch still passes with that filter removed.

## Why

An export that leaks another account's scripts would not be caught.

## Done when

A case exports as one signed-in account while a second account owns scripts, and fails when the ownership filter is removed.

## Evidence

Filled at landing: what ran and where its output is.
