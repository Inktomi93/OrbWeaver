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

Auth uses its canonical schema. Builders require request-specific capture, not fabricated defaults.

Reviewed source `f787a21337` captures native chat import, compaction, held streams and owner-scoped handoff. Imagery rejects timestamp-only merging. Scoped controls pass.

Browser responders preserve captured input/output, absent versus null input and conflicting or unmatched capture refusal. Adoption remains open.

Builders reject schema drift and zeroed production tokens; helpers derive public compose types.

New corpus inputs use actual admission; legacy Resolved fabrication helpers do not qualify them.

Reviewed source `505c900fb5` produces native OIDC claim, pending and session captures. Its capsule proves physical disposal, sole WAL ownership on reopen, secret stripping and independent DB/CAS clones. Matching auth controls pass. Portable assertions run everywhere; descriptor observations are Linux-specific.

The same batch uses real automation producers for watcher conditions, caps, manual-run provenance, state and foreign-owner refusal. Removing the subject guard produces an extra fired row for a stranger's asset. Finite request recipes admit only validated outputs and exact captured inputs. Private captures stay Node-owned.

Reviewed source `b78b5b8d0a` proves native SDK session lineage and the empty-seed no-row control. Reuse its funding controls.

Reviewed source `800bd9d45a` captures native plugin/provider lifecycle and private rows. Consent, repeats, failure containment and physical clone controls pass. Injected edit stamps fix the world-info clock defect.

Reviewed source `aea5f56d54` produces refinery and discovery rows through real admission, transcript history and memory backfill. Scoped cases and the expanded native capsule pass; independent review confirms the batch.

Persisted workload funding is integrated. The expanded native capsule passes with the funder FK, producer completion, secret stripping and independent database and asset clones.

Reviewed sources `3303ed4825`, `5cef750b0d` and `80bd8e5102` produce native RPG, schedule, knowledge, swipe and GIF state. Native cuts and scoped controls pass.

Reviewed sources `fa0badf99b` and `69c196ed8f` preserve immutable checkpoints and native RPG recursion, cancellation, visibility, fork, handoff and intake. Defect controls preserve turn lineage.

Reviewed source `7feb12bdf2` captures native routed search outputs, provenance and scopes. A capped-denominator defect control fails. Enabled empty-owner completion remains separately owned; publication and adoption remain open.

Reviewed source `68e71302cf` captures native connection, catalog, capability, diagnostic and admitted-turn cost outputs. Finite physical HTTP and DNS preserve native ownership, admission, funding and parsers. Capsule holds and secret exclusion pass; the task-projection control fails. HTTP admission, complete coverage, publication and adoption remain open.

Reviewed source `4c5ae5c652` captures native library lifecycles and ingestion chunks. Native, seed and order controls pass. Source `fa98caa7a5` loads the required clone module before the timed case. Aggregate `2968548` passes with disposal, independent DB/CAS clones and secret exclusion. The deadline and assertions are unchanged; whole-run cost is not reduced. Complete coverage, publication and adoption remain open.
