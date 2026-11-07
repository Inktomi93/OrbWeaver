---
kind: tooling
status: open
updated: 2026-11-07
priority: P3
area: tooling
plan: test-foundation
---

# AppliedLoadEmulation cannot be cast past in tooling

## What

no-unsafe-type-assertion covers only tests in eslint.config.ts, so tooling source can cast a value into AppliedLoadEmulation without the brand's constructor.

## Why

A brand that tooling can cast past proves nothing about the throttle it names.

## Done when

The assertion rule covers that tooling path, or the brand has one construction door, with a plant that fails.

## Evidence

Filled at landing: what ran and where its output is.
