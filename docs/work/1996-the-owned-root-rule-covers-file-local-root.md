---
kind: tooling
status: open
updated: 2026-11-07
priority: P3
area: testing
plan: test-foundation
---

# The owned-root rule covers file-local root aliases

## What

localRoot, harness() and similar aliases escape the name match in the owned-root lint rule. List each alias, remove it, or move the rule to a type-aware check.

## Why

A name-based rule leaves a root unowned behind an alias.

## Done when

An aliased root acquisition with no owner fails lint.

## Evidence

Filled at landing: what ran and where its output is.
