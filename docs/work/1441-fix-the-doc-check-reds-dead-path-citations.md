---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: docs
---

# Fix the doc check reds: dead path citations in three Spine and Tier docs and the UI-Architecture size cap

## What

`pnpm test:tools tests/tooling/doc/ops/check.int.test.ts` fails on dead path citations in `docs/law/Spine-Config-and-Serialization.md`, `docs/law/Spine-Identity-and-Auth.md` and `docs/law/Tier-3b-Providers.md`, and on `docs/law/UI-Architecture-and-Layout.md` exceeding its byte cap. Repoint or remove each dead citation against the code, and compact UI-Architecture under its cap without dropping a ruling.

## Why

A red doc check hides new doc defects, and lanes keep reporting it as inherited.

## Done when

`tests/tooling/doc/ops/check.int.test.ts` passes, and every repointed citation names a file that exists and holds the cited thing.

## Evidence

Filled at landing: what ran and where its output is.
