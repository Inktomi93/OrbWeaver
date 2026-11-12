---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: snap-secret-hygiene
---

# Refuse userinfo in the snap fixture env fallbacks

## What

SNAP_FIXTURE_SERVER_URL and SNAP_FIXTURE_BASE_URL accept user:password@ in tooling/src/snap/ops/fixture.ts. The refusal line masks it, but a live fixture would navigate with userinfo.

## Why

The credential door ruling covers the flags only, not the env fallbacks.

## Done when

resolveFixtureTarget refuses an env URL that carries userinfo and quotes none of it.

## Evidence

Filled at landing: what ran and where its output is.
