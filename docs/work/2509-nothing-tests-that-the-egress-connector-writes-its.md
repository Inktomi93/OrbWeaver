---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: security
---

# Nothing tests that the egress connector writes its security event when it refuses

## What

packages/server/src/infra/network/egress.ts refuses a connection to a private address inside the connector and writes a security event before it throws a typed error marked as recorded, so callers add no second log line. The security review deleted the connector's security events and every test stayed green; it also marked two refusals that write no event as recorded and every test stayed green. The composed-root plugin preview test stops at the earlier resolve check and never reaches the connector; one handoff test covers the connector, on the address-literal path only.

## Why

The recorded marker suppresses the caller's log line, so a refusal marked recorded with no event written leaves no trace of a blocked request. The security record is the one that must never be dropped.

## Done when

A test drives a connection the connector refuses after name resolution (a name that resolves public at the first check and private at connect) and asserts the refusal and exactly one security event. The recorded marker can only be set by the code that writes the event, by construction or by a type, so the two cannot disagree.

## Evidence

Filled at landing: what ran and where its output is.
