---
kind: tooling
status: doing
updated: 2026-11-21
priority: P3
area: tooling
lane: wt/agent-a4e9784beb9524066
plan: unwired-code
---

# The unwired tool reports procedures and routes no client calls

## What

The client imports the router as one AppRouter type, so knip sees every tRPC procedure as used; chat.getNextTurnConnection surfaced only because its output fields looked dead. HTTP routes registered on the server have the same blind spot.

## Why

An uncalled procedure is live attack surface and maintenance with no product reader.

## Done when

pnpm unwired gains a procedures verb that lists every tRPC procedure and HTTP route with no production caller, with a planted-fixture test of a called and an uncalled procedure, and the orchestrator judges its first report.

## Evidence

Filled at landing: what ran and where its output is.
