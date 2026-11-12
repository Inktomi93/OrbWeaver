---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: checked-law
---

# Macro resolution happens only in its home

## What

A lint rule that refuses a macro resolver call outside the module the ruling names. The sites whose comments claimed the checker are listed under M4 in the missing-checker list under reports/law-census.

## Why

The restriction lost its rule, so a second resolution site can land unreported.

## Done when

The rule runs at zero, a planted call outside the home fails its test, and the site cites it.

## Evidence

Filled at landing: what ran and where its output is.
