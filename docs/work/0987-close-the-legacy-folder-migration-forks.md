---
kind: work
status: doing
updated: 2026-10-12
priority: P2
lane: codex/legacy-boundary-987
plan: test-foundation
---

# Close the legacy folder migration forks

## What

Adjudicate the legacy migration forks: test-layout uses LEGACY_FILE_CEILING rather than an exact shrinking file set; test-reach credits tests/legacy; jscpd.tests.json includes legacy; the CI qualification generation must distinguish the changed job population; script consumers import legacy test helpers. Keep legacy regression cases in CI while strict gates judge rebuilt tests.

## Why

The folder boundary must not admit replacement files, credit rebuilt coverage from legacy cases, or leave production probes dependent on disposable test helpers.

## Done when

Each fork has a recorded ruling and matching enforcement or a scoped follow-up. Check the qualification generation against the workflow change and retain case coverage.

## Evidence

Pending integration, `621774c21c` removes legacy reach credit and CPD contamination, updates qualification to `product-v4`, and fixes singleton matrix group identity. Legacy CI jobs and regression files remain unchanged. Focused checker/production-CLI controls pass, as does the tooling compiler program. Root compilation reports unrelated Knip baseline typing errors; the main findings item owns those errors.

Exact shrinking filenames remain unresolved: current resources expose current membership, not historical membership. Keep the ceiling until a lawful monotonic Git-boundary check is designed; do not add a private gate baseline.

Script consumers are `reranker-live`, `ollama-window`, `gemini-capabilities`, `caching` and `smart-picker-live`. Their imported inference rigs contain copied rules and fabricated values. Replace them through real probe composition or a genuinely shared transport helper, not by moving fake harnesses into testkit. Record source-specific follow-ups before closure.

At integration, narrow Spine-Testing section 2 so legacy reach is not strict proof. Its other presence and test-id policies are separate subjects. This partial leg does not close the item.
