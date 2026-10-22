---
kind: work
status: open
updated: 2026-10-22
priority: P3
plan: test-foundation
---

# Adjudicate unused testkit support with replacement cases

## What

Classify unused testkit exports when selecting replacement cases. Keep production-derived support needed by the rebuild; delete copied adapters and obsolete aliases without maintained consumers.

## Why

Knip reports unused exports, not whether an unadopted helper is a legitimate rebuild foundation.

## Done when

Each selected export has a maintained consumer, a concrete replacement-case purpose, or a justified deletion. Do not add exports solely to keep external reference tests compiling.

## Evidence

`tests/support/browser/ct-data-providers.tsx` mounts production composition and has maintained CT consumers. It is not a legacy-only adapter. Evaluate factories and accessibility helpers by their actual implementation and intended cases.
