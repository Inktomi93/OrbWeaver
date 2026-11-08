---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: testing
lane: wt/agent-aada102e03c183697
plan: test-foundation
---

# ollamaServer takes a finite plan instead of boolean flags

## What

Side generation tests use boolean flags on their Ollama server. Make it disposable with a finite plan that refuses an unused reply.

## Why

A flag needs a remembered assertion.

## Done when

ollamaServer is disposable and refuses an unused reply.

## Evidence

Filled at landing: what ran and where its output is.
