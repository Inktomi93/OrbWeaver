---
kind: work
status: doing
updated: 2026-10-12
priority: P2
area: tests
lane: wt/agent-a607e89b29e4722fb
plan: test-mirror
---

# tRPC fixtures return full contract output from real builders

## What

Owner ruling (item 906): tRPC responder fixtures return the FULL contract output built from real test-data builders, never a subset. A probe swapping TrpcFixture in tests/support/node/route-trpc.ts to full-output-only raised type errors across CT and fixture files, because many output types have no builder in tests/support/factories. Add the missing builders and migrate the call sites directory by directory, then delete the subset type.

## Why

A subset fixture keeps passing when the contract adds a field the component reads, so the test proves a shape production never sends.

## Done when

TrpcFixture accepts only full contract output, every call site builds its output from a factory, and the subset type is deleted.

## Evidence

Filled at landing: what ran and where its output is.
