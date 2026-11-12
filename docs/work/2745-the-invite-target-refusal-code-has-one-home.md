---
kind: work
status: open
updated: 2026-11-12
priority: P3
area: contracts
plan: authorization-and-visibility
---

# The invite target refusal code has one home

## What

The refusal code `invite_target_unknown` is spelled by hand in the server, in the client and in a test.

## Why

A rename in one place leaves the client matching a code the server no longer sends.

## Done when

One exported constant in `packages/contracts` holds the code, and the server, the client and the test read it.

## Evidence

Filled at landing: what ran and where its output is.
