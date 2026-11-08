---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# corpus-knowledge-variants holds its time budget under load

## What

The corpus-knowledge-variants suite runs near its time budget and times out under load.

## Why

A suite that sits at its budget fails on a busy runner and reads as a product red.

## Done when

The suite runs well inside its budget, by sharing setup or splitting it, and passes repeatedly at the load where it timed out.

## Evidence

Filled at landing: what ran and where its output is.
