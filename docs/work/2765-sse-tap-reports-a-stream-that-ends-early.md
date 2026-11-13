---
kind: tooling
status: open
updated: 2026-11-13
priority: P3
area: tooling
plan: authorization-and-visibility
---

# sse-tap reports a stream that ends early

## What

`pnpm sse-tap` exits 0 when its stream ends early, and its test fixture does not refuse a GET.

## Why

A tap that exits clean on a dropped stream reports a healthy stream that was not one.

## Done when

An early end exits non-zero, and the fixture refuses a GET, each with a test.

## Evidence

Filled at landing: what ran and where its output is.
