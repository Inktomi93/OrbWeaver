---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: server
plan: test-foundation
---

# The bug report route and its debug token header have one production home

## What

The bug report route string and the debug token header name are inline literals, copied in the client and in tests.

## Why

Tests cannot import them, so a rename leaves a copy behind.

## Done when

Both are exported from contracts and the server, the client and the tests read them.

## Evidence

Filled at landing: what ran and where its output is.
