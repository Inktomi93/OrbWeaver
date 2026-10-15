---
kind: work
status: doing
updated: 2026-10-15
priority: P1
lane: codex/share-acme-harness-958
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

Native controls preserve OIDC/session transitions, automation provenance, plugin consent/containment, funded execution, RPG lineage and canonical search/library outputs. Scoped cases and defect controls remain. `58e889386b` integrates enabled empty-owner memory completion.

Reviewed `afdd075a66` qualifies routed stats/settings/theme capture through actual writers, reconciliation and parsers. CSS-copy controls discriminate the defect. Foreign timing, differential cost populations and ownerless seed rows remain open.

The aggregate retains closure, sole-WAL, pending/handoff state, secret exclusion and independent DB/CAS clones. Guards remain; descriptor observations are Linux-specific.

Reviewed `0a3e773354` adds native SDK lineage to captures and scrubbed clones. Physical imports prove rewind and re-adoption; production owns admission, cancellation and direct-child disposal. Aggregate and targeted controls pass. Deliberate intervention remains unverified under the platform limitation. Canonical shape coverage and replacement suites remain open.

Reviewed `83380c0db2` and `1a10e499df` preserve native notification, automation and plugin producers. Recipient, reset, replay and peer-cancellation controls discriminate real faults. Canonical rows match scrubbed clones; complete payload coverage remains open.

Reviewed `5270c95e4d` adds native image skips, generation/edit/provenance variants, host-funded previews, refusal-before-effects and honest unknown cost. Source and scrubbed clone rows/CAS agree. Semantic and schema-drift controls fail as intended, then pass after exact restoration. Native multipart parsing remains confined to controlled outbound SDK bytes. Existing cases and guards remain intact.

Reviewed `fa2aac0491` rejects producer-known raw and JSON-escaped private values before schema diagnostics or fixture effects. Native malformed-key controls preserve safe diagnostics; exact request recipes and clean clone controls pass. Native cookie parsing remains production-owned. Arbitrary encodings and complete witness coverage are not established.

Reviewed `717c8adff2` publishes finite notification and ordinary-member lifecycle snapshots from actual routed reads. Viewer, request and stage remain separate; native inclusive-floor, hidden-byte and known-secret refusal controls pass. Independent security review confirms fixture selection is not authentication. Complete capsule/clone qualification with these sections remains open.

Complete projections, builders, shared adoption and suite replacement remain open. Private captures do not widen the portable recipe.
