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

The testing law bans the wall clock and randomness in tests and permits fake timers only for a subject that is a real setTimeout window no injected clock can drive. The ESLint clock selectors cover packages and skip tests, and the law census found test files that call Math.random, Date.now and a bare new Date. The authoring checklist states the fake timer rule more strictly than the law does.

## Why

A test that reads the wall clock or a random value is not deterministic, and the checklist step is the one most often skipped because nothing fails.

## Done when

ESLint selectors over tests refuse Math.random, Date.now and an argument-free new Date, beside the existing test syntax block. Every existing site injects its clock or ids or is fixed, and the rule is on at zero with no file exemption. The checklist step on determinism matches the testing law's fake timer sentence and names the lint rule. Each fake timer site is listed with the real timer window it tests; that part of the ruling stays checked by review.

## Evidence

Filled at landing: what ran and where its output is.
