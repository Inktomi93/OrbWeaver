---
kind: bug
status: doing
updated: 2026-10-08
priority: P1
area: ci
lane: codex/ci-scanner-findings
---

# Resolve SPA hints and corpus workflow scanner findings

## What

Assess and resolve scanner findings in `packages/server/src/entry/http/spa.ts` and `.github/workflows/ci.yml`.

## Why

Main branch scanners flag comment deletion and inline workflow expressions.

## Done when

Reproduce real defects with native tests. Preserve static serving and qualification policies. Confirm the findings close in hosted scans and CI qualifies the commit.

## Evidence

Filled at landing: what ran and where its output is.
