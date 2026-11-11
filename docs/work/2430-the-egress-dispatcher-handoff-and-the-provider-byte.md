---
kind: work
status: open
updated: 2026-11-11
priority: P2
area: security
---

# The egress dispatcher handoff and the provider byte pins have tests in the repository

## What

The SSRF dispatcher contract suite and the per-transport wire byte-pin suites for anthropic-messages and openai-compat exist only in the reference-only legacy test tree. Comments in `pnpm-workspace.yaml` named them as live protection. `packages/server/src/infra/network/egress.ts` is the only consumer of the global dispatcher. Source: `docs/work/codebase-review/units/root-config.md`.

## Why

A provider or undici bump can break the egress guard or the request bytes with no test turning red.

## Done when

A test under `tests/server/infra/network/` fails when the global dispatcher handoff breaks, and a suite in the repository pins the request bytes of both chat transports through production code. The workspace catalog comments name the live tests.

## Evidence

Filled at landing: what ran and where its output is.
