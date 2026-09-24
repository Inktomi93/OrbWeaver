---
kind: bug
status: open
updated: 2026-09-24
priority: P1
area: network
---

# Refuse an unparseable resolved address in the egress pin

## What

resolveValidatePin in packages/server/src/infra/network/egress.ts checks resolved addresses with isInRanges, which parses a zone-scoped address such as fe80::1%eth0 to null and so does not block it. getaddrinfo can return such an address from /etc/hosts, and it would be pinned and dialled. Refuse any resolved address the parser cannot read. Separately, @orb/kit/ip reads a leading-zero IPv4 such as 010.0.0.1 as decimal, where node:net rejects it and the WHATWG URL parser reads octal; rule which reading the kit parser owns.

## Why

An address the range check cannot read must never pass the guard that exists to stop internal dials.

## Done when

A test pins a zone-scoped resolved address refused and a planted control shows the old code admits it; the kit parser's leading-zero behavior is ruled and tested.

## Evidence

Filled at landing: what ran and where its output is.
