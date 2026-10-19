---
kind: work
status: doing
updated: 2026-10-19
priority: P2
lane: wt/agent-a2f6cc226f4a38146
plan: test-foundation
---

# Flow-walking CTs move to e2e

## What

CTs that mount a route or the app shell and stub the network to walk a user flow move their cases to e2e specs on the golden corpus, and are deleted. Component, measurement and hard-state cases stay in CT.

## Why

A flow CT pays the cost of stubbing every call and still cannot see a broken wire, which e2e sees for free.

## Done when

No CT mounts a route or the app shell to walk a flow; each moved case runs as an e2e spec; the deleted CTs' cases are listed against their new specs.

## Evidence

Filled at landing: what ran and where its output is.
