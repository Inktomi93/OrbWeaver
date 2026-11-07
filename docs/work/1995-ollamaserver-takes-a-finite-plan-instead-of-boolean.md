---
kind: work
status: open
updated: 2026-11-07
priority: P3
area: testing
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
