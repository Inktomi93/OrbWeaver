---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
plan: unwired-code
---

# The unwired graph reports an HTTP route no caller requests

## What

tooling/src/unwired/graph/routes.ts pairs a Hono route's path parameters with their reads, and the procedures verb reports tRPC procedures with no caller, but no verb reports a Hono route under packages/server/src/entry/http that no client fetch, form, link or test requests.

## Why

A route nothing calls is dead surface the scans cannot see, and on a server edge it is attack surface too.

## Done when

A graph verb lists each Hono route with its callers, matched by resolved path literal or template, reports a route with none, and has red-first fixture cases for a called and an uncalled route plus a route reached only by an external client that is listed as received.

## Evidence

Filled at landing: what ran and where its output is.
