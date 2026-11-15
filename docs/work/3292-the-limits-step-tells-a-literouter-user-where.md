---
kind: work
status: doing
updated: 2026-11-15
priority: P3
area: client
lane: wt/agent-a5487884af20f9847
---

# The limits step tells a LiteRouter user where the window comes from

## What

LiteRouter states no limits in its models list, and the effective window is the account's chat-memory setting in its dashboard. Add a per-provider hint to the connection limits step: "LiteRouter doesn't publish this model's limits. The context window is your account's chat memory setting in the LiteRouter dashboard."

## Why

A LiteRouter user asked for the real limits has no way to know the number lives in the service's dashboard.

## Done when

The limits step on a LiteRouter connection shows the hint, and other providers show none.

## Evidence

Filled at landing: what ran and where its output is.
