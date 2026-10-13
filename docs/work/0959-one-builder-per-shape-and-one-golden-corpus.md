---
kind: work
status: doing
updated: 2026-10-13
priority: P1
lane: codex/compose-import-998
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

Close the logical table/output inventory. Exported declarations alone do not distinguish outputs from inputs, operations and primitives. Qualified user and asset defaults consume production ID and content-hash generation. Preserve FK relations and coupled consumers. The harness owns graph, time and ID seams; the client door owns mounting; this item owns data builders, corpus and responders.

Inventory data returned or serialized by live production doors and their reusable output components. Include server-owned wire projections; keep their producers in the node world. Classify request schemas, injected operations, primitive vocabulary and private helper shapes separately. Exported-name counts do not establish the builder denominator.

Capture HTTP auth outputs through the real application and its resolved request identity. A tRPC caller does not produce anonymous auth configuration. The server root owns HTTP construction; corpus code must not build another app or copy its projection.

The canonical auth-configuration schema and consumer parsing are integrated through the [boundary-parsing assignment](0982-wire-values-are-parsed-at-every-boundary-not.md). Capture its complete request-specific response through the qualified server root before claiming the builder. The schema supplies validation, not fabricated authentication or deployment defaults.

Browser responders select actual captured route inputs and outputs. Preserve absent versus explicit null input, reject conflicting captures, and refuse unmatched input without a fabricated success. This lookup does not establish generated corpus adoption.

The pure/default builder floor passes its scoped runtime, compiler, lint and selected-policy checks. Owner-schema drift fails an executed test; replacing production token calculation with zero also fails. Exact source restoration returns the baseline to green. Helpers derive private service types through the public compose result, not undeclared package doors. Derived token size is not an override. Legacy override scaffolds remain replacement debt. Producer-row runtime proof, recall and corpus adoption still require the qualified server root.

The selected fabrication policy still consumes waivers in `tests/support/node/factories/resolved-connection.ts`. New corpus inputs use actual admission and credential resolution. Waiver budgets remain unjudged.

Bounded producer cases pass for real seed turns, cookie authentication, ingestion, imagery and discovery. An imagery timestamp-only control merges distinct calls and fails; exact restoration passes. Complete row/output coverage, native lifecycle captures, corpus publication and each-layer loading remain unfinished.
