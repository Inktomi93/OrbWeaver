---
kind: tooling
status: doing
updated: 2026-10-19
priority: P2
lane: wt/agent-a33d1c29ea416c61f
---

# Unite the id-brand gate moves from the type-tests and ids shards

## What

The type-tests shard (merged) deletes typeid-prefix-boundary and keeps the id-brand libraries for the id gates; the ids shard deletes no-fake-disabled-id, no-loose-id-cast, no-raw-id and wire-json-parsed-at-consumer and points the shared delivery tests at typeid-prefix-boundary. Applied together they leave the id-brand-flow family and the native id-brands type-fact family with no consumer, and native-cast-delivery.int would cite a deleted gate.

## Why

Each shard was verified against main alone, so neither proof covers the pair; the ids gates stay in force until the union lands.

## Done when

The ids shard applies on main without typeid-prefix-boundary; id-brand-flow\.suite and the gate-driven native-id-boundary delivery tests are deleted; native-cast-delivery runs on a surviving typed native gate; the id-brands fact family and tooling/src/verify/lib/\_proof/id-brand.ts are deleted after a census shows no consumer; every claim of the deleted gates names its native successor; an independent verifier confirms.

## Evidence

Filled at landing: what ran and where its output is.
