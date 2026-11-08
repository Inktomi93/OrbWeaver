---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: security
---

# Egress contract wording matches the host and port allowlist grammar

## What

The comment in packages/server/src/infra/network/contract/egress.ts still describes the allowlist as hosts only. Update it to the host and port grammar.

## Why

A contract comment that names the old grammar sends the next author to the wrong rule.

## Done when

The contract comment states the host and port grammar and that a bare host admits every port.

## Evidence

Filled at landing: what ran and where its output is.
