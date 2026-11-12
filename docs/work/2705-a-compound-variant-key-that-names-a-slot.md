---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
plan: checked-law
---

# A compound variant key that names a slot is refused

## What

In a `tv()` recipe a slot name written beside a compound variant's conditions is read as a condition, so the classes never apply and nothing fails. The stacked number field carried that mistake. A check of every recipe in `packages/ui/src` and `packages/client/src` finds no other instance today.

## Why

The mistake is silent: the style is simply absent, and it took a walk finding to see it.

## Done when

A lint rule or a test over every `tv()` export refuses a compound variant key that is not a variant of that recipe, with a planted control, on at zero.

## Evidence

Filled at landing: what ran and where its output is.
