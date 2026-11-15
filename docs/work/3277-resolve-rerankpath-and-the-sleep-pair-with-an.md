---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# Resolve rerankPath and the sleep pair with an origin check

## What

Resolve `features.rerankPath`, `sleep.isSleepingPath` and `sleep.wakePath` with an origin check like the key check path's: a joined URL whose origin differs from the base URL's sends nothing. Today `packages/inference/src/backends/openai-compat/rerank.ts` and `packages/inference/src/backends/openai-compat/reachability.ts` join by string concatenation and send `Authorization: Bearer <key>`.

## Why

String concatenation lets `@host/x` (on a base URL with no path) or `.host/x` send the key to another host, from a plugin row or a user declaration. A plugin row's base URL host must be in its `netHosts`, so this goes around the install-time host consent. Pre-existing.

## Done when

Each path refuses a cross-origin result, and the schema admits only a plain path; a case per path asserts on the responder's request log that nothing reached the other origin.

## Evidence

Filled at landing: what ran and where its output is.
