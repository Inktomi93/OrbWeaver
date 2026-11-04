---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: testing
plan: restoration-register
---

# Investigate newly reachable native Vitest diagnostics

## What

Investigate the native Vitest diagnostics exposed by canonical testkit runner recognition. Distinguish assertion defects from rule recognition mismatches.

Inspect `tests/contracts/preset/st-preset-import.contract.test.ts` at lines 35.

Inspect `tests/server/domain/chat/persistence/durable-delta-drain.int.test.ts` at lines 97, 101, 102.

Inspect `tests/server/domain/chat/persistence/handoff-debt-rows.suite.int.test.ts` at lines 406.

Inspect `tests/server/domain/serial-chain-lifetime.suite.int.test.ts` at lines 205.

Inspect `tests/server/infra/plugin-host/process-value-escape.int.test.ts` at lines 106.

Inspect `tests/tooling/eslint-test-derivation.test.ts` at lines 79, 127, 147, 170, 186, 209.

Inspect `tests/tooling/floor/appearance/appearance.test.ts` at lines 181.

Inspect `tests/tooling/snap/ops/page-validate.test.ts` at lines 116.

## Why

Canonical runner imports now activate existing native rules. Conditional assertions and unjoined promise assertions can hide failures; matcher and title diagnostics need precise correction.

## Done when

Adjudicate each diagnostic with its actual case and producer. Preserve custom runner and hook recognition. Fix confirmed issues without suppressions or weaker assertions. Run affected native tests and compiler programs. The Appearance bulk-negative finding remains tracked in `docs/work/1900-investigate-tooling-test-observation-gaps.md`.

## Evidence

The configured-rule scan covers native Vitest rules and the retained compound-assertion rule over maintained test sources. It uses syntax parsing without typed project services.

The conditional reports involved asymmetric matcher construction and a fixture invariant, rather than skipped behavioral assertions. Their construction and narrowing are explicit.

The promise assertion was already joined through the pending-work collection. Its result is explicitly awaited after releasing the held write.

The SDK marker and performance evidence have exact expected values. Appearance explanations require nonempty text, and parameterized titles have distinct prefixes.

The focused Node, tooling and Chromium runs pass. Affected Node/DOM compiler programs, scoped Biome/ESLint, dependency-cruiser and independent review pass.

The configured-rule rescan reports no remaining newly reachable diagnostics. Existing findings outside this assignment remain separate.
