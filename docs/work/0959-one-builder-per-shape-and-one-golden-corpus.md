---
kind: work
status: doing
updated: 2026-10-14
priority: P1
lane: codex/corpus-integration-959
plan: test-foundation
---

# One builder per shape and one golden corpus

## What

Every contract output and database row has one builder in `@orb/testkit`, built from contract defaults or by running production. The seed tool writes one synthetic corpus that e2e, CTs, server tests and side-eye all read.

## Why

Hand-written fixtures drift from the contracts, and each test layer invents its own data.

## Done when

A builder exists per contract output and table; the corpus is committed and loaded by each test layer; a builder test reds when a contract adds a required field.

## Evidence

The shared production recall preparation passes bounded positive and strike controls. Actual completed workloads produce nonempty digests, segments and query traces, validated through the public `assemblyPreviewSchema` projection. Native capsule controls also produce speaker rows through real turns. This does not qualify every recall filter or complete corpus publication.

Inventory tables and output doors, including server-owned projections. Keep producers Node-owned. Derive IDs and hashes from production; preserve FK relations. The harness owns execution seams.

Capture HTTP auth outputs through the real application and resolved request identity. A tRPC caller does not produce anonymous auth configuration. Reuse the server root's HTTP app.

The canonical auth-configuration schema and consumer parsing are integrated. Capture its complete request-specific response through the qualified server root before claiming the builder. The schema supplies validation, not fabricated authentication or deployment defaults.

Browser responders select actual captured route inputs and outputs. Preserve absent versus explicit null input, reject conflicting captures, and refuse unmatched input without a fabricated success. This lookup does not establish generated corpus adoption.

Pure/default builder controls pass. Owner-schema drift and zeroed production token calculation fail; restoration passes. Helpers derive service types through public compose. Complete producer and adoption proof requires the canonical root.

The selected fabrication policy still consumes waivers in `tests/support/node/factories/resolved-connection.ts`. New corpus inputs use actual admission and credential resolution. Waiver budgets remain unjudged.

Bounded producer cases pass for real seed turns, cookie authentication, ingestion, imagery and discovery. An imagery timestamp-only control merges distinct calls and fails; exact restoration passes. Complete row/output coverage, native lifecycle captures, corpus publication and each-layer loading remain unfinished.

Reviewed source `dd7d73f2e9` and correction `c7b4a2026e` use the canonical harness. Current seed, wire, recall, imagery-cohort/import and greeting cases pass. Retained builder callers preserve their assertions. Funding and SDK cases remain deferred with their raw-script dependency, preserved in `6e595679a7`; other donor results remain unqualified.

Portable publication uses validated outputs and finite request recipes; mismatched inputs and private fields refuse. Clone selection precedes boot and preserves its target guard. Uncommitted native OIDC and capsule controls produce real auth, content and recall. Earlier capsule success does not qualify strengthened quiescence: native statement retention blocks it. The native database disposal assignment owns that defect. Complete publication and adoption remain unqualified.

The uncommitted automation extension uses existing production producers and the real graph. Bounded cases cover watcher conditions, caps, manual-run provenance, state and foreign-owner refusal. Its seed publication control passes. The complete expanded capsule still requires native database disposal and a matching publication run; earlier capsule evidence does not cover it.
