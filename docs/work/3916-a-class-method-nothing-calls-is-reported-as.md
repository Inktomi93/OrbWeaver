---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# A class method nothing calls is reported as untouched

## What

A method on a live class with no call or read lands in no member bucket; only property siblings are reported. The delete-trial lane found it on a planted tree (`reports/lanes/2026-11-22-3892.md`).

## Why

It is dead code the graph hides, and the delete trial cannot confirm a candidate that is never proposed.

## Done when

A planted uncalled method on a live class reports in member-untouched; an overriding or interface-implementing method that the base or interface dispatches stays live; each case proven red.

## Evidence

Filled at landing: what ran and where its output is.
