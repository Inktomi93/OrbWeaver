---
kind: work
status: doing
updated: 2026-10-06
priority: P2
area: tooling
lane: codex/launch-verify-product
---

# Add the complete product verification tier without tool proofs

## What

Add verify --product through the existing verification CLI and stage registry. Preserve the full application, component, E2E, type, structure, dependency, build and documentation checks. Exclude tooling tests, tool-corpus conformance and mutation testing.

## Why

The owner needs complete application verification without repeating tool self-certification. The full tier remains available for combined application and tooling verification.

## Done when

The product tier retains every full stage except the declared proof and mutation exclusions. CLI selection, complete stage membership, reporting and existing tier behavior have meaningful regression coverage. Independent review clears required findings.

## Evidence

Filled at landing: what ran and where its output is.
