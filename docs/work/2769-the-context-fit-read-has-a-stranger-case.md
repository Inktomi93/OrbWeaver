---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: tests
plan: authorization-and-visibility
---

# The context-fit read has a stranger case

## What

Removing the seat check from `previewContextFit` in `packages/server/src/domain/chat/verbs/read.ts` leaves every test green. No test calls that route as a stranger.

## Why

A seat check no test holds can be removed without notice, and the route then answers anyone.

## Done when

A test calls the context-fit read as a stranger and with an unknown room id and finds the two answers identical; removing the seat check turns it red.

## Evidence

Filled at landing: what ran and where its output is.
