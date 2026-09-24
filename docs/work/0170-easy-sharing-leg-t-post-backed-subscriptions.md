---
kind: work
status: open
updated: 2026-09-24
priority: P1
area: network
plan: easy-sharing
---

# Easy-sharing leg T: POST-backed subscriptions

## What

Build leg T of docs/plans/easy-sharing/design.md: the server accepts subscriptions over POST, and the client uses a POST-backed EventSource for httpSubscriptionLink, always on. It lands on its own and nothing depends on the other legs.

## Why

Cloudflare quick tunnels buffer every GET body, so live streams stall over a quick tunnel. A probe measured 0 bytes in 35 s on GET while POST streamed.

## Done when

The leg T test floor in the plan passes.

## Evidence

Filled at landing: what ran and where its output is.
