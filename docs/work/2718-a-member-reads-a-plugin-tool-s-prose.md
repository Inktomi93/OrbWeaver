---
kind: work
status: open
updated: 2026-11-12
priority: P3
area: chat
plan: authorization-and-visibility
---

# A member reads a plugin tool's prose result with hidden spans removed

## What

A plugin tool's string return is stored as a result that is not JSON, and a member reads it through the prose strip in `packages/contracts/src/chat/member-projection.ts`. No test covers it, so removing that strip passes the suite.

## Why

A strip on a member read that nothing guards.

## Done when

An integration test with an installed plugin tool that returns prose holding a hidden tag shows the member read stripped and the host read as stored, red with the strip removed.

## Evidence

Filled at landing: what ran and where its output is.
