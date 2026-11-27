---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: tests
plan: test-foundation
---

# The SDK stand-in process has neutral slot names for valid frames

## What

tests/server/domain/chat/engine/engine-sdk-physical.mjs reuses bad-meta slot names for valid SDK frames because tests/support/node/contract/sdk-process.ts offers no neutral slots.

## Why

A slot named for a malformed frame misleads the next reader of a valid-frame case.

## Done when

sdk-process.ts offers neutral slot names and the engine cases use them.

## Evidence

Filled at landing: what ran and where its output is.
