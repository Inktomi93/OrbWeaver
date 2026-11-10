---
kind: bug
status: doing
updated: 2026-11-10
priority: P2
area: client
lane: wt/agent-a4ff8ff9f3bafdce5
plan: test-foundation
---

# The history pagination CT finds why ordinary history takes half a minute

## What

platform-history-pagination.suite.ct.tsx ordinary history exceeds its 30s budget under load, and failed most runs on a clean tree. It passes with a far larger budget, so the work is slow, not broken. Related item 1836 covers the WebKit case.

## Why

A red on a clean tree trains every lane to ignore this suite, and it may be a real slow path in history reads. Never raise the budget to hide it.

## Done when

The cause is named, the repeated work or product slowness is removed, and the case passes repeated runs at load near the core count with the budget unchanged.

## Evidence

Filled at landing: what ran and where its output is.
