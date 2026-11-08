---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: testing
lane: wt/agent-aa1f4dc846d1712b8
plan: test-foundation
---

# Node tests that take a table baseline right after creating a harness may race the background character seed: settle them through the harness

## What

Settle node tests that baseline a table right after creating a harness and signing a user in, through the harness `settleBackground` step (tests/support/node/server.ts), so they cannot race the detached user seed. Start by listing the tests that read a baseline after the first authed request.

## Why

The first authed request of a user starts the seed detached (`supervise(...)` at packages/server/src/entry/http/app.ts:162), so a baseline taken before it finishes can include or miss seeded rows. Only the owner seed at boot is awaited (lifecycle.ts:524). The harness has `settleBackground`, and only tests/server/transport/trpc/live-bus-isolation.int.test.ts calls it. No flaking test is named yet.

## Done when

Each node test that reads a table baseline after an authed request waits on the harness settle step first, the Evidence lists those tests, and repeated whole-suite runs show no such flake.

## Evidence

Filled at landing: what ran and where its output is.
