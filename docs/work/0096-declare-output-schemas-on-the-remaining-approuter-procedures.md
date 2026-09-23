---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: transport
---

# Declare output schemas on the remaining AppRouter procedures

## What

About 227 tRPC procedures have a schema-ready return but no declared output schema.

## Why

Strict output schemas stop a server change from silently widening what the client receives.

## Done when

Each schema-ready procedure declares .output() with its contracts schema; the transport suite passes and the output-schema gate count reaches zero.

## Evidence

Filled at landing: what ran and where its output is.
