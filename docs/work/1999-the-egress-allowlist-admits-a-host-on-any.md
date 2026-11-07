---
kind: bug
status: open
updated: 2026-11-07
priority: P3
area: server
plan: test-foundation
---

# The egress allowlist admits a host on any port

## What

envEgressAllowlist is keyed by host, so a member's endpoint write reaches any port on an allowlisted LAN host. Design a grammar with a port and a migration note, or record the acceptance.

## Why

Operators add a LAN identity provider to the allowlist, and that opens every port on it.

## Done when

The allowlist binds host and port, or the acceptance is recorded with its reason.

## Evidence

Filled at landing: what ran and where its output is.
