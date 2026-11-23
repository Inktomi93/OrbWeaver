---
kind: tooling
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# A computed-key access gives the access its own roles

## What

tooling/src/unwired/graph/keys.ts #elementKeys marks every computed-key access as a read of each member the key can name, including a plain x\[k] = v store and a discarded bump, which the roles.ts header rules store only.

## Why

A member only ever stored or bumped through a computed key is credited as read, so a write-only finding is hidden.

## Done when

A computed-key access takes the store, bump, delete or read role its position gives, as a named access does; planted cases on an untyped local holder show x\[k] = v and a discarded x\[k] += 1 leaving the members write-only and a read x\[k] reading them, each red on the old code.

## Evidence

Filled at landing: what ran and where its output is.
