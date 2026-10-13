---
kind: tooling
status: doing
updated: 2026-10-13
priority: P2
area: tooling
lane: codex/native-exceptions-1008
plan: test-foundation
---

# Route instrument environment access through the shared door

## What

Apply the audited instrument environment batch using existing processEnvValue, inheritedProcessEnv and withProcessEnv operations. Preserve evaluation timing, defaults, filtering, override order and the real CDP fault protocol.

## Why

Instrument readers duplicate ambient environment access despite an existing same-tier owner, retaining unnecessary suppressions and mutation cleanup copies.

## Done when

The exact audited sites use the existing owner without changed values, snapshots of live aliases or weaker assertions. Affected environment lifecycle controls, scoped lint and tooling/root types pass. Shared-reader, seed, host and application configuration sites stay outside this batch.

## Evidence

Filled at landing: what ran and where its output is.
