---
kind: tooling
status: open
updated: 2026-11-14
priority: P3
area: server
---

# A substrate file cannot reach I/O through its own engine or service

## What

The policy `domain-substrate-no-io` refuses a direct runtime import of the database, a persistence module or infra from `substrate/`. A substrate file that imports its domain's `engine/` or `service.ts` still reaches the database through it. `packages/server/src/domain/automation/substrate/run-now.ts`, `packages/server/src/domain/chat/substrate/assembly-access.ts` and `packages/server/src/domain/chat/substrate/turn-access.ts` do this today.

## Why

Core-0 §4 states substrate is pure. An indirect route makes the new policy pass while the folder still performs I/O.

## Done when

The policy refuses a substrate import of its domain's engine and service, the files above have a home that fits, and `pnpm depcruise` reports no violation.

## Evidence

Filled at landing: what ran and where its output is.
