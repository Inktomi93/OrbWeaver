---
kind: bug
status: open
updated: 2026-10-12
priority: P1
---

# Wire values are parsed at every boundary, not only in the client

## What

Spine-TypeScript says wire values that cross a boundary are parsed, not cast, but wire-json-parsed-at-consumer judges the client only. The server casts fetched bodies, among them the JWKS body in packages/server/src/infra/auth/jwks.ts. Parse each server and inference wire read through its schema, and widen the rule to every package that reads a wire value.

## Why

A cast of an untrusted response body trusts whatever arrives; on the auth path that is a key set the server verifies tokens with.

## Done when

Every server and inference wire read parses through a schema; the check covers every package with a planted control; a security review confirms the auth reads.

## Evidence

Filled at landing: what ran and where its output is.
