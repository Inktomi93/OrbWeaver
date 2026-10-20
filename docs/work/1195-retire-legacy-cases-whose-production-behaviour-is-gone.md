---
kind: work
status: open
updated: 2026-10-20
priority: P1
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

Wire-dispatch coverage does not establish current executor funding, credential or accounting authority. Real-root replacements own those claims. Retained side-generation, conformance and catalog cases still require their promised legacy exit, so a qualified source leg does not complete this item. Evidence: `reports/review/1195-legacy-obsolete-review.md`.

Source legs `77de3a0ced` and `9a6e5a009c` are integrated on main. Combined root and DOM checks pass. The complete native legacy-node program reports only remaining chat-engine diagnostics, owned by the engine rebuild; no SDK fixture diagnostic remains. Evidence: `reports/review/1195-combined-legacy-type-followup.md` and `reports/review/1195-combined-legacy-types.log`. The delivered source leg is complete; the remaining legacy exit has no active lane.
