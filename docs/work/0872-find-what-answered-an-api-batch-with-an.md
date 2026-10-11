---
kind: bug
status: blocked
updated: 2026-10-11
priority: P3
area: server
blocked: owner
---

# Find what answered an API batch with an HTML page in production

## What

Owner saw a tRPC batch fail after 13.4s with 'Unexpected token <, \<!doctype ... is not valid JSON' on v0.2.0; the server logged no request. 865 proved node cannot serve HTML to an /api path (method-matrix test), never redirects on session expiry, and has no service worker; the client now names the HTTP status and content type instead of a JSON parse error.

## Why

The real source is in front of the app (proxy, tunnel or an auth layer) and is still unknown.

## Done when

The source is identified from the owner's edge logs or a HAR capture of a recurrence, and fixed there or documented as a deployment note.

## Evidence

Filled at landing: what ran and where its output is.
