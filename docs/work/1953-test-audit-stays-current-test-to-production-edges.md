---
kind: tooling
status: open
updated: 2026-11-08
priority: P3
area: testing
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

The edge table and both queries are built; the model benchmark is not run. `pnpm test-audit build --audit=<index.sqlite>` reads the audit's current case records, keeps each `path:line` or `path:start-end` citation of a production file the record's revision holds, and fills a case with no citation from CodeGraph's direct callees of its test file. `pnpm test-audit proves <path>[:<line>]` and `pnpm test-audit touches <test-path>` answer the two directions, and each edge is judged at query time: stale when its test file changed since the record's revision, or when a `git diff -U0` hunk touches its production range. On current main, a one-line change inside a cited range of `packages/kit/src/binding/index.ts` turned exactly the case citing that range stale and left its sibling case current.

`pnpm test-audit bench` measures the only reader that runs here: CodeGraph's direct callees name `8.6%` of the production files the trace cites, at `36.7%` precision. That makes CodeGraph a gap fill, not a stand-in for a reading. No Sonnet or Qwen reading ran: no local engine was up, a lane may not spawn a Sonnet reader, and OpenRouter credit is reserved. The benchmark still needs those readers scored with the same agreement measure.
