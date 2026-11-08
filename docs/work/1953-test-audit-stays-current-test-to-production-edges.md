---
kind: tooling
status: doing
updated: 2026-11-08
priority: P3
area: testing
lane: wt/agent-a60e00384795f1ed5
plan: test-foundation
---

# Test audit stays current: test to production edges, staleness and a model benchmark

## What

Parse the audit's production traces into an edge table of test case to production file and line range, filling gaps from CodeGraph. A record is stale if either end changed. Query both directions: what proves this file, and what this test touches. Then benchmark Sonnet and the local Qwen lane by re-reading a sample and comparing with the existing records, so only changed files need a model read.

## Why

Reachability shows what a test runs through; the audit shows what it asserts. That goes stale fast without tracking both ends.

## Done when

Both queries work on current main, a changed production file marks its cases stale, and the benchmark names a reader with measured agreement.

## Evidence

Filled at landing: what ran and where its output is.
