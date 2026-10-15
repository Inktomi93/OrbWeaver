---
kind: work
status: open
updated: 2026-10-15
priority: P1
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

Reviewed `b29020315d` captures production-created library rows and fixes character creation to use injected time for both stamps. Reviewed `323cf89045` captures actual character snapshot references, historical views, summaries and paginated library output while preserving the row-only API. Lawful database fixtures remain unchanged.

Reviewed `7c087293c8` captures actual member cookie identities and excludes ambient owner fallback as admission proof. Reviewed `97cbc929f5` qualifies fresh private login on the scrubbed clone through native credential setup and verification. Source credentials refuse. Scoped password reset and logout preserve the other viewer. Publication bytes and source rows remain unchanged; clone disposal joins before database close. Public identities do not authenticate clones or carry credentials.

Reviewed `28d1757b51` captures native persona, preset, roster and tag producer variants while preserving prior rows and settings. The integrated capsule and scrubbed clone pass. Evidence: `reports/runs/test/main-673151-2026-10-15T06-45-14-992Z/test-report.json`. Complete root types retain off-owned diagnostics: `reports/review/ready-train-root-types.log`. No clean application verdict is established.

Schema population is recorded in `reports/review/959-native-table-inventory.json`. Reference leads in `reports/review/959-table-builder-map.json` do not prove builders or writers. `reports/review/959-table-builder-semantics.json` separates production captures, lawful database fixtures and unresolved paths. Mounted uses in `reports/review/959-mounted-output-uses.json` establish parser presence, not canonical output or builder completeness.

Reviewed `7a99361a4e` qualifies generated foreign timing, differential selected model and character economics, retained swipes and native unstarted greetings. Injected clock advances occur at the provider edge; production records the observations. Timed unstarted generations are unreachable through maintained producers. SDK controls retain their stated platform limitation.

Complete projections/builders, canonical contract-output coverage and shared adoption remain open. Replacement suites follow complete foundations; these captures do not authorize general legacy ports.
