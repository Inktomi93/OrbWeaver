---
kind: tooling
status: doing
updated: 2026-11-24
priority: P2
area: tooling
lane: wt/agent-a3d884e64c98c584c
plan: unwired-code
---

# Serialization destinations resolve their callee through the checker

## What

boundaries.ts serializedBy decides whole-value reads and destinations from callee, receiver and binding spellings, while open-sends.ts already resolves callees to their package.

## Why

A JSON.stringify into a binding named like a key or a callee named like a hash credits every field as read and hides dead fields.

## Done when

serializedBy resolves its callee symbol and decides by the declaring lib or package, the name regexes are deleted, the shared log and wire constants have one home, and fixtures for a misnamed binding and a real Map key pass.

## Evidence

Filled at landing: what ran and where its output is.
