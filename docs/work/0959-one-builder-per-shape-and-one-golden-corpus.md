---
kind: work
status: doing
updated: 2026-10-15
priority: P1
lane: codex/corpus-stats-qualification-959
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

Reviewed publication batches preserve finite viewer/request/stage projections and reject known raw or JSON-escaped private values before diagnostics. Fixture identity is not authentication. Unknown secrets and arbitrary encodings are not covered by this refusal guarantee. Notification, member-chat, world-info and regex projections preserve their native outputs through independent scrubbed DB/CAS clones.

Native library captures retain actual rows, injected character timestamps, snapshot references, historical views and paginated output. Lawful database fixtures remain unchanged.

Reviewed `7c087293c8` captures actual member cookie identities and excludes ambient owner fallback as admission proof. Reviewed `97cbc929f5` qualifies fresh private login on the scrubbed clone through native credential setup and verification. Source credentials refuse. Scoped password reset and logout preserve the other viewer. Publication bytes and source rows remain unchanged; clone disposal joins before database close. Public identities do not authenticate clones or carry credentials.

Application qualification remains open.

Population evidence: `reports/review/959-table-builder-semantics.json` and `reports/review/959-mounted-output-uses.json`. Producer captures, lawful database fixtures and unresolved paths remain distinct. Parser presence does not prove builder completeness.

Reviewed `7a99361a4e` qualifies generated foreign timing, differential selected model and character economics, retained swipes and native unstarted greetings. Injected clock advances occur at the provider edge; production records the observations. Timed unstarted generations are unreachable through maintained producers. Reviewed `5287e4e9f4` publishes final owner stats through canonical schemas and exact recipes. SDK controls retain their stated platform limitation.

Reviewed `536a70b5be` publishes native tag, persona and roster relations through canonical schemas and exact recipes. Native refusal controls bind the fixture viewer to its actual output. Integrated SDK and library capsule cloning passes with the unchanged guard. Evidence: `reports/runs/test/main-1291946-2026-10-15T09-07-22-409Z/test-report.json`. Integrated ISO types pass; root diagnostics remain unchanged in `reports/review/wire-workload-integrated-types.log`.

Complete projections/builders, canonical contract-output coverage and shared adoption remain open. Reviewed `b9b1db54df` moves unchanged preset, automation and warning wire schemas into contracts. Public index APIs remain; private facades are removed. Portable preset and live-rule qualification remains open. Replacement suites follow complete foundations; these captures do not authorize general legacy ports.
