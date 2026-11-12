---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: security
plan: authorization-and-visibility
---

# An unparseable EGRESS_ALLOWLIST entry warns at boot

## What

packages/server/src/infra/network/egress.ts drops an EGRESS_ALLOWLIST entry it cannot parse with no log line. Log a boot warning naming the entry.

## Why

An owner who mistypes a host and port sees the dial refused with no hint that the allowlist entry itself was ignored.

## Done when

A test boots with one malformed entry and asserts the warning names it, and the valid entries still apply.

## Evidence

Filled at landing: what ran and where its output is.
