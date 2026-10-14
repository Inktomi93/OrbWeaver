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

Builders derive request-specific outputs from production types, schema defaults or actual writers. Schema-drift and zero-token controls reject fabricated inputs. Browser responders preserve exact input/output, absent versus null, and conflicting or unmatched capture refusal. Legacy-only Resolved helpers do not qualify native data.

`tests/support/node/corpus.ts` owns the private producer composition. Its typed captures name the actual auth, library, recall, automation, plugin, knowledge, chat, imagery, RPG, search, connection and stats/settings owners. These execute the production graph with physical external edges, injected clocks and IDs; no test-side domain assembly qualifies them.

Native controls preserve OIDC claims and pending/session transitions; watched/manual automation provenance; plugin consent and failure containment; funded workload execution; retained RPG lineage, checkpoints, cancellation and host handoff; and canonical search, library and ingestion outputs. Each family retains its scoped cases and defect controls. Enabled empty-owner memory completion is integrated through `58e889386b`.

Reviewed source `afdd075a66` adds native routed stats and user-settings/theme lifecycles. Actual generations and reconciliation produce nonzero rollups. Theme duplication, parser import/repeat/collision, baseline restoration and refused foreign writes use real owners. The exact CSS-copy defect control fails, and production bytes are restored. Scoped lint/Biome pass; root types retain only the existing off-wave diagnostics.

Aggregate `3056035` completes producer disposal, sole-WAL observation, locks/pending/handoff checks, secret exclusion and independent DB/CAS clones, including cloned stats, themes and settings. Its case passes under the unchanged deadline. Source `fa98caa7a5` places required clone dependency initialization before the timed case; it does not reduce whole-run cost. Portable assertions run everywhere; descriptor observations are Linux-specific.

The stats cohort does not qualify foreign timing isolation, differential percentile/cost populations or exact seed-byte preservation. Its refusal snapshots cover the participating owners, not ownerless seed rows. The independent review accepts the selected private wave without claiming broader authority.

Reviewed source `0a3e773354` adds native SDK lineage to private captures and scrubbed clones. Physical imports prove rewind and re-adoption; admission, cancellation and direct-child disposal remain production-owned. Aggregate and targeted controls pass. Deliberate intervention remains unverified under the reported platform limitation; no replacement-suite qualification is claimed. Notification lifecycle, image-skip, output variants and genuine plugin outputs remain open. Use the canonical shape reader for coverage.

Committed secret-reviewed corpus publication and every-layer adoption remain open. Private captures do not widen the closed portable recipe. Existing optional loaders and bounded responder consumers do not establish application adoption. Complete builder coverage, corpus-backed smoke and general suite replacement are not claimed.
