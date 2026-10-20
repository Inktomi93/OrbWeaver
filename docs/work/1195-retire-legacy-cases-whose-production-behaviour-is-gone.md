---
kind: work
status: doing
updated: 2026-10-20
priority: P1
lane: codex/legacy-obsolete-1195
plan: test-foundation
---

# Retire legacy cases whose production behaviour is gone

## What

Rows: server/infra/network/safefetch-selfenforcing.suite.test:222,234 cases 218,229, the owner-configured-endpoint egress class, removed by 7f6202a00f; client/state/config-group-registry.test:7 cases 13,18, the anchor formatter, private since b34b6910b8; inference/roles/executor.test:44,83, executor embedding accounting over a fake registry, where dispatch now re-reads the owned connection and credential; inference/roles/side-gen.test:44,50, conformance/\_harness.ts:296,304, catalog/listing.test:102 (cases 233,351), backends/agent-sdk/catalog.test:41: the same executor constructor plus loosely typed agent-sdk query doubles. Paths under tests/legacy/.

## Why

These cases test behaviour production removed or made unrepresentable; patching them would invent it back, and they keep the legacy typecheck red.

## Done when

Each row is deleted with its reason, or rebuilt against the current behaviour through the runtime executor or the registry door, and leaves tsconfig.tests-legacy.json.

## Evidence

Filled at landing: what ran and where its output is.
