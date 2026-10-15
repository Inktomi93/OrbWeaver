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

Builders derive outputs from production types, defaults or actual writers. Responders retain exact requests, absent/null distinctions and conflicting-capture refusal. Direct database fixtures remain lawful for database subjects; they do not qualify composed production behavior.

`tests/support/node/corpus.ts` owns the genuine producer graph. Native cases cover identity/session transitions, automation, plugin consent and containment, funded execution, retained RPG lineage, SDK sessions, search and library operations. Private rows, credentials and physical observations remain outside portable DTOs.

Reviewed `fa2aac0491`, `717c8adff2` and `98b54e0ce0` preserve finite viewer/request/stage projections and reject known raw or JSON-escaped private values before diagnostics. Fixture identity is not authentication. Unknown secrets and arbitrary encodings are not covered by this refusal guarantee.

Source `d4226546af` qualifies notification, member-chat, world-info and regex projections together through the complete integrated capsule and independent scrubbed DB/CAS clone. Explicit equality uses actual producer outputs. Existing privacy, closure, pending-state, SDK/stats, row and teardown assertions remain. Matching omission controls and affected checks pass. Evidence: `.claude/worktrees/share-acme-harness-958/reports/review/959-owner-stage-publication.md`.

SDK rewind/re-adoption and native child disposal retain their scoped controls; the deliberate SDK intervention remains unverified under its recorded platform limitation. Stats foreign timing, differential cost populations and ownerless seed rows remain open. Native root checks retain off-owned diagnostics; complete application qualification is not established.

The native schema denominator is `reports/review/959-native-table-inventory.json`. Reference leads in `reports/review/959-table-builder-map.json` do not prove builders or writers. Semantic qualification in `reports/review/959-table-builder-semantics.json` distinguishes production-backed captures, database fixtures and unresolved paths. Contract-output coverage is a separate unmeasured denominator.

Reviewed `7c087293c8` captures actual member cookie identities and excludes ambient owner fallback as cookie proof. Public identity DTOs preserve native consistency and secret refusal; they do not authenticate scrubbed clones. Reviewed `b29020315d` adds production-created library row captures and corrects character creation to use injected business time for both stamps. Lawful database fixtures remain unchanged.

The combined main capsule and clone pass with these integrations. Evidence: `reports/runs/test/main-3075446-2026-10-15T04-54-00-790Z/test-report.json`. Root types retain off-owned errors in `reports/review/root-corpus-integration-types.log`; complete application qualification is not established.

Complete projections/builders, contract-output coverage, clone login setup and shared adoption remain open. Replacement suites follow complete foundations; no general legacy port is authorized by these captures.
