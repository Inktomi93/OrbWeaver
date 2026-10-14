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

The shared production recall preparation passes bounded positive and strike controls. Actual completed workloads produce nonempty digests, segments and query traces, validated through the public `assemblyPreviewSchema` projection. This does not qualify every recall filter or corpus publication. Speaker rows still require a genuine producing turn; invented rows or zero traces cannot close that population.

Inventory tables, live output doors and reusable output components, including server-owned wire projections. Keep their producers Node-owned. Separate inputs, injected operations, primitives and private helper shapes. Derive IDs and content hashes from production; preserve FK relations. The harness owns execution seams, the client door owns mounting, and this item owns builders and corpus.

Capture HTTP auth outputs through the real application and its resolved request identity. A tRPC caller does not produce anonymous auth configuration. The server root owns HTTP construction; corpus code must not build another app or copy its projection.

The canonical auth-configuration schema and consumer parsing are integrated through the [boundary-parsing assignment](0982-wire-values-are-parsed-at-every-boundary-not.md). Capture its complete request-specific response through the qualified server root before claiming the builder. The schema supplies validation, not fabricated authentication or deployment defaults.

Browser responders select actual captured route inputs and outputs. Preserve absent versus explicit null input, reject conflicting captures, and refuse unmatched input without a fabricated success. This lookup does not establish generated corpus adoption.

Pure/default builder controls pass affected checks. Owner-schema drift and zeroed production token calculation fail; restoration passes. Helpers derive service types through public compose. Derived token size is not an override. Legacy scaffolds remain replacement debt. Complete producer and adoption proof requires the canonical root.

The selected fabrication policy still consumes waivers in `tests/support/node/factories/resolved-connection.ts`. New corpus inputs use actual admission and credential resolution. Waiver budgets remain unjudged.

Bounded producer cases pass for real seed turns, cookie authentication, ingestion, imagery and discovery. An imagery timestamp-only control merges distinct calls and fails; exact restoration passes. Complete row/output coverage, native lifecycle captures, corpus publication and each-layer loading remain unfinished.

Reviewed source `dd7d73f2e9` and correction `c7b4a2026e` use the canonical harness. Current seed, wire, recall, imagery-cohort/import and greeting cases pass. Retained builder callers preserve their assertions. Funding and SDK cases remain deferred with their raw-script dependency, preserved in `6e595679a7`; other donor results remain unqualified.

Portable publication uses owner-validated outputs and finite corpus request recipes. Producer capture and hydration share those recipes; mismatched inputs and private envelope fields refuse. A prepared clone is selected before server boot; setup retains its target guard and skips independent seeding only for that selection. Successful capsule generation and adoption remain unqualified.
