---
kind: tooling
status: open
updated: 2026-10-30
priority: P3
area: server
---

# Bring domain event emitters under the bus channel rule

## What

orb/bus-channel-primitive is scoped to packages/server/src/transport/\*\* in eslint.config.ts. Domain emitters such as packages/server/src/domain/workloads/engine/progress-bus.ts and packages/server/src/domain/plugin/substrate/plugin-event-bus.ts sit outside it, so the bus law is not enforced there. Decide whether they are buses under the law and either widen the rule or record why they are exempt.

## Why

An emitter the rule cannot see can drift from the bus contract silently.

## Done when

Each domain emitter is either covered by the rule with a planted control or named as an exemption with its reason in the law.

## Evidence

Filled at landing: what ran and where its output is.
