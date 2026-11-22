---
kind: tooling
status: open
updated: 2026-11-22
priority: P3
area: tooling
plan: unwired-code
---

# Library calls the scans read are recognized by symbol, not spelling

## What

Reflective calls, Hono responses, zod schemas, membership tests, z.enum, TanStack form types and route registrar folders are matched by text or path where the checker resolves the declaring symbol.

## Why

An alias or a renamed handler parameter silently drops a read or a route, and a same-named local method is taken for the library's.

## Done when

Each listed site resolves its callee or type symbol and checks the declaring package, the route inventory walks every production file with the Hono check, and an aliased fixture per case passes.

## Evidence

Filled at landing: what ran and where its output is.
