---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: server
---

# Pin durable-first ordering for buses that carry truth

## What

client-architecture-state-and-gates.md requires the durable INSERT to assign seq before the live publish, and resume or replay to read the durable log. tests/server/domain/chat/bus-golden.suite.int.test.ts asserts live event order and that durable replay matches the live commits, but nothing asserts insert-before-publish or seq assignment order in the chat bus.

## Why

A reorder that publishes before the durable write would pass every current test and lose events a resuming client cannot recover.

## Done when

An integration test through the production chat verbs observes the durable row with its seq before the live event is delivered, with a control that fails when publish moves ahead of the insert.

## Evidence

Filled at landing: what ran and where its output is.
