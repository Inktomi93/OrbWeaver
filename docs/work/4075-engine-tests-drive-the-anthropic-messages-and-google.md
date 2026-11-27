---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: tests
plan: test-foundation
---

# Engine tests drive the anthropic-messages and google refusals to a room notice

## What

Only the agent-sdk refusal path is driven end to end to a room notice; the anthropic-messages and google refusal emitters have no engine-level case.

## Why

A refusal from those providers could stop reaching the person with every test green.

## Done when

Each refusal emitter has a composed-turn case that ends in the room's provider_refused notice.

## Evidence

Filled at landing: what ran and where its output is.
