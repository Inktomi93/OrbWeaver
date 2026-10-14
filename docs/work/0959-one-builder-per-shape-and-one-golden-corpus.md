---
kind: work
status: doing
updated: 2026-10-14
priority: P1
lane: lane/959-rpg-variants
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

Canonical recall workloads produce digests, segments and query traces; native turns produce speaker rows. Defect controls pass; complete variants remain open.

Auth uses its canonical schema. Builders require request-specific capture, not fabricated defaults.

Reviewed source `f787a21337` adds native chat import, compaction, held stream and handoff captures with owner-scoped copied-seat identity. Imagery controls reject timestamp-only cohort merging. Runtime and static controls pass; publication and adoption remain open.

Browser responders preserve captured input/output, absent versus null input and conflicting or unmatched capture refusal. Adoption remains open.

Builder controls reject owner-schema drift and zeroed production token calculation. Helpers derive service types through public compose. Adoption remains open.

`tests/support/node/factories/resolved-connection.ts` consumes fabrication waivers. New corpus inputs use actual admission; budgets remain unjudged.

Real seed, auth, ingestion, imagery and discovery controls pass. Timestamp-only imagery merging fails. Complete row/output coverage and each-layer adoption remain open.

Reviewed source `dd7d73f2e9` and correction `c7b4a2026e` use the canonical harness. Seed, wire, recall, imagery-cohort/import and greeting cases pass. Retained builder callers preserve their assertions.

Reviewed source `505c900fb5` produces native OIDC claim, pending and session captures. Its capsule proves physical disposal, sole WAL ownership on reopen, secret stripping and independent DB/CAS clones. Matching auth controls pass. Portable assertions run everywhere; descriptor observations are Linux-specific.

The same batch uses real automation producers for watcher conditions, caps, manual-run provenance, state and foreign-owner refusal. Removing the subject guard produces an extra fired row for a stranger's asset. Finite request recipes admit only validated outputs and exact captured inputs. Private captures stay Node-owned.

Reviewed source `b78b5b8d0a` proves native SDK session lineage and the empty-seed no-row control. Reuse its funding controls.

Reviewed source `800bd9d45a` captures native plugin/provider lifecycle and private rows. Consent, repeats, failure containment and physical clone controls pass. Injected edit stamps fix the world-info clock defect.

Reviewed source `aea5f56d54` produces refinery and discovery rows through real admission, transcript history and memory backfill. Scoped cases and the expanded native capsule pass; independent review confirms the batch.

Persisted workload funding is integrated. The expanded native capsule passes with the funder FK, producer completion, secret stripping and independent database and asset clones.

Reviewed sources `3303ed4825`, `5cef750b0d` and `80bd8e5102` produce native RPG hand, population, resync, journal and schedule state, plus knowledge arcs, swipes and GIF geometry. Native cuts and scoped controls pass. Complete builder coverage, committed corpus and every-layer adoption remain open.

Reviewed source `fa0badf99b` preserves immutable checkpoints. Reviewed source `69c196ed8f` produces native RPG recursion, cancellation, visibility, fork, handoff and intake captures. Defect controls and capsule assertions preserve original turn lineage. Complete coverage, publication and adoption remain open.
