---
kind: tooling
status: open
updated: 2026-11-11
priority: P2
area: tests
plan: checked-law
---

# Test files get the clock, randomness and fake timer bans by lint

## What

The test authoring checklist bans the wall clock, randomness and fake timers in tests. The ESLint clock selectors cover packages and skip tests, and the law census found test files that call vi.useFakeTimers, Math.random, Date.now and a bare new Date.

## Why

A test that reads the wall clock or a random value is not deterministic, and the checklist step is the one most often skipped because nothing fails.

## Done when

ESLint selectors over tests refuse vi.useFakeTimers, Math.random, Date.now and an argument-free new Date, beside the existing test syntax block. Every existing site injects its clock or ids or is fixed, and the rule is on at zero with no file exemption. The checklist step names the rule.

## Evidence

Filled at landing: what ran and where its output is.
