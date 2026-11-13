---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: plugin
plan: authorization-and-visibility
---

# A server plugin guest receives a fixed sentence for a host fault

## What

`rpcError` in `packages/server/src/infra/plugin-host/process-protocol.ts` forwards the raw message of every failed bridge op to the server guest. A database fault's message is the failed query text with SQL and bound values.

## Why

The scripted guest now gets a fixed sentence for a fault; the server guest is the other half of the same boundary and still sees server internals.

## Done when

Only a named refusal keeps its text; any other error reaches the guest as one fixed sentence under a fixed name; a test forces a database fault in a bridge op and finds no SQL in the guest's log.

## Evidence

Filled at landing: what ran and where its output is.
