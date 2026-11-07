---
kind: bug
status: open
updated: 2026-11-07
priority: P3
area: server
plan: test-foundation
---

# The signed forward path refuses a stock authentik proxy provider with a misleading reason

## What

The authentik proxy provider signs its JWT with HS256 and the client secret, and the server pins RS256 and ES256. With verification on by default, an operator is refused with a log line that points at FORWARD_AUTH_JWKS, which cannot help. Detect the algorithm and name the way out: verification off behind trusted proxies.

## Why

An operator following the log line sets a key that can never work.

## Done when

A stock authentik token is refused with a message that names the working configuration, and a test pins the message code.

## Evidence

Filled at landing: what ran and where its output is.
