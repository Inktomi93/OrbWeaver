---
kind: bug
status: doing
updated: 2026-11-13
priority: P3
area: tests
lane: wt/agent-a1818ad5924fb1c71
plan: test-foundation
---

# Name the unattached rooms when a socket CT page closes

## What

When a routeOrbSocket wait never completes, the page-close rejection in tests/support/node/route-orb-socket.ts says the socket handshake failed before its frames were served, and the case fails only at the 30 s test timeout.

## Why

The message misleads triage and a regression that failed in about 5 s before now costs 30 s.

## Done when

The rejection says the page closed and names the rooms that never attached, with a helper self-test case.

## Evidence

Filled at landing: what ran and where its output is.
