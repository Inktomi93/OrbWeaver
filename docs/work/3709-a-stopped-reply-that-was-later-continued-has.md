---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: chat
plan: test-foundation
---

# A stopped reply that was later continued has a test for its missing Stopped mark

## What

packages/client/src/features/chat/lib/message-readout.ts hides the Stopped mark when a stopped reply was continued, and no test covers that branch, so deleting the check stays green.

## Why

An untested branch can regress silently.

## Done when

A CT continues a stopped reply and asserts no Stopped mark, red when the check is removed.

## Evidence

Filled at landing: what ran and where its output is.
