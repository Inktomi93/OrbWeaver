---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: server
plan: test-foundation
---

# The egress allowlist admits a host on any port

## What

envEgressAllowlist is keyed by host, so a member's endpoint write reaches any port on an allowlisted LAN host. Design a grammar with a port and a migration note, or record the acceptance. Migration note for the host and port grammar: a bare EGRESS_ALLOWLIST host keeps every port. A host:port entry admits only that port, and it outranks a bare entry for the same host. The OIDC issuer and FORWARD_AUTH_JWKS URLs admit their own host at their own port only. An identity provider the server reaches on another port needs a host:port entry, or a bare host entry for every port.

## Why

Operators add a LAN identity provider to the allowlist, and that opens every port on it.

## Done when

The allowlist binds host and port, or the acceptance is recorded with its reason.

## Evidence

Filled at landing: what ran and where its output is.
