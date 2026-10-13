---
kind: work
status: blocked
updated: 2026-10-12
priority: P2
area: inference
blocked: on 958
plan: test-foundation
---

# Rebuild the Gemini capability probe on persisted credentials and real tool composition

## What

Replace legacy secrets, stores and connection rows in `scripts/probes/gemini-capabilities/run.ts` with composed credential and connection operations. Run ordinary turns through the real tool registry and turn door, not handmade tool membership.

## Why

Fabricated branded secrets and map stores bypass credential ownership, authenticated encryption, revocation and actual composition. Production service doors exist; complete isolated proof still depends on the harness.

## Done when

Remove legacy helper imports. Preserve native and OpenRouter Flash/Pro replay, required and named tools, parallel-off observations, response formats, forced formats and strict routing. Assert exact replay IDs, signatures and opaque data. Preserve request caps, route caps, timeout and closed diagnostics. A scripted test must catch a production replay defect without network access.

## Evidence

Filled at landing: what ran and where its output is.
