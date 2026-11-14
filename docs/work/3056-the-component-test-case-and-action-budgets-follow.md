---
kind: tooling
status: open
updated: 2026-11-14
priority: P3
area: tests
plan: test-foundation
---

# The component test case and action budgets follow the load during a run

## What

playwright-ct.config.ts scales its test timeout and its actionTimeout through budget() at config load. Playwright copies both by value into each worker's project model (FullProjectInternal timeout, the use block), and a worker lives for the whole run, so a run that gets busier keeps the first reading. The expect budget now re-reads per test through expectBudget; the case timeout can be re-read per test only with testInfo.setTimeout from an auto fixture, and the CT files that import test straight from @playwright/test take no repo fixture.

## Why

Under load the expect budget can now grow past the unscaled case timeout, so a slow case fails on the case timeout instead of the assertion.

## Done when

A busy reading taken during a run scales the CT case timeout and action timeout for the next test, through budget(), with an in-process fixture that changes the reading.

## Evidence

Filled at landing: what ran and where its output is.
