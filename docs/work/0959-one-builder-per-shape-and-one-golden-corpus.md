---
kind: work
status: blocked
updated: 2026-10-14
priority: P1
blocked: on 984
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

Canonical recall workloads produce digests, segments and query traces through public projections; native turns produce speaker rows. Positive and strike controls pass. Complete recall variants and corpus publication remain open.

Auth configuration uses its canonical schema. Complete builder qualification requires real request-specific capture, not fabricated defaults.

Browser responders select actual captured route inputs and outputs. Preserve absent versus explicit null input, reject conflicting captures, and refuse unmatched input without a fabricated success. This lookup does not establish generated corpus adoption.

Pure/default builder controls pass. Owner-schema drift and zeroed production token calculation fail; restoration passes. Helpers derive service types through public compose. Complete producer and adoption proof requires the canonical root.

`tests/support/node/factories/resolved-connection.ts` consumes fabrication waivers. New corpus inputs use actual admission; budgets remain unjudged.

Bounded producer cases pass for real seed turns, cookie authentication, ingestion, imagery and discovery. An imagery timestamp-only control merges distinct calls and fails; exact restoration passes. Complete row/output coverage, native lifecycle captures, corpus publication and each-layer loading remain unfinished.

Reviewed source `dd7d73f2e9` and correction `c7b4a2026e` use the canonical harness. Seed, wire, recall, imagery-cohort/import and greeting cases pass. Retained builder callers preserve their assertions.

Reviewed source `505c900fb5` produces native OIDC claim, pending and session captures. Its capsule proves physical disposal, sole WAL ownership on reopen, secret stripping and independent DB/CAS clones. Matching auth controls pass. Portable assertions run everywhere; descriptor observations are Linux-specific.

The same batch uses real automation producers for watcher conditions, caps, manual-run provenance, state and foreign-owner refusal. Removing the subject guard produces an extra fired row for a stranger's asset. Finite request recipes admit only validated outputs and exact captured inputs. Private captures stay Node-owned.

Reviewed source `b78b5b8d0a` proves genuine SDK session lineage through canonical greeting, start and send producers, with an empty-seed no-row control. The funding qualification owns this case; corpus work reuses its evidence instead of copying its producer.

Reviewed source `800bd9d45a` captures plugin/provider families through real install, consent, native guest activation, owner claims and tombstones. Recipient consent, repeat skips and contained activation failure pass. Captures stay Node-private; the expanded capsule preserves disposal, scrub and clone controls. A real clock defect control fails before world-info creation receives the injected edit stamp; creation and first-edit cases then pass.

The source-home map is not complete row, output or variant coverage. Refinery, discovery, RPG, imagery, schedule and transient outcome recipes remain. Committed corpus publication and every-layer adoption remain open.

The retained knowledge and refinery leg has prepared source and matching scoped controls. Knowledge qualification and the expanded capsule wait for canonical typed authority. Keep the uncommitted leg; do not substitute fabricated bulk tokens or domain results.
