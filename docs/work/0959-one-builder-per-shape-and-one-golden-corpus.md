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

`tests/support/node/corpus.ts` owns the private producer composition. Its typed captures name the actual auth, library, recall, automation, plugin, knowledge, chat, imagery, RPG, search, connection, stats/settings, SDK and notification owners. These execute the production graph with physical external edges, injected clocks and IDs; no test-side domain assembly qualifies them.

Native controls preserve OIDC claims and pending/session transitions; watched/manual automation provenance; plugin consent and failure containment; funded workload execution; retained RPG lineage, checkpoints, cancellation and host handoff; and canonical search, library and ingestion outputs. Each family retains its scoped cases and defect controls. Enabled empty-owner memory completion is integrated through `58e889386b`.

Reviewed `afdd075a66` adds routed stats and settings/theme captures through actual generations, reconciliation, parser import and refusal owners. Native CSS-copy controls fail with the defect and pass after restoration. Selected owner snapshots do not qualify foreign timing isolation, differential percentile/cost populations or ownerless seed rows.

Aggregate `3473032` preserves producer closure, sole-WAL, locks/pending/handoff, secret exclusion and independent DB/CAS clones. The expanded case completes in 19.028 seconds under its local 20-second guard, with every operation and assertion inside. Earlier 15-second attempts time out; no 15-second performance qualification follows. Required clone dependency initialization remains import-time. Portable assertions run everywhere; descriptor observations are Linux-specific.

Reviewed source `0a3e773354` adds native SDK lineage to private captures and scrubbed clones. Physical imports prove rewind and re-adoption; admission, cancellation and direct-child disposal remain production-owned. Aggregate and targeted controls pass. Deliberate intervention remains unverified under the reported platform limitation; no replacement-suite qualification is claimed. Image-skip, output variants and genuine plugin outputs remain open. Use the canonical shape reader for coverage.

Reviewed `83380c0db2` adds native invite, kick, handoff and consent captures. Actual cookie admission, recipient refusal, replay/live correction/retraction and canonical clone rows pass. The network owner joins ordinary peer cancellation while retaining genuine stream faults; its unchanged-source control fails. Remaining notification producers still need native coverage.

Reviewed `1a10e499df` adds real automation, resident plugin notice/crash-disable and deferred hostless-drop producers. Recipient and reset cuts fail; canonical rows match source and scrubbed clone. Native request retention preserves abort through collection and releases on physical close. Genuine faults remain failures. Native and aggregate controls pass under unchanged local guards.

Secret-reviewed publication and adoption remain open. Private captures do not widen the portable recipe. Complete builders, smoke and suite replacement are not claimed.
