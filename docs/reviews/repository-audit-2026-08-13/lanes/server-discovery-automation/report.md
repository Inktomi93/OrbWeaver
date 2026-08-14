# Server discovery, automation, and embeddings audit

## Coverage

| Metric | Result |
| - | - |
| Assigned files read | 191 / 191 (100%) |
| Assigned text lines read | 21,499 / 21,499 (100%) |
| Assigned bytes read | 1,014,078 / 1,014,078 (100%) |
| Current hashes | 191 / 191 match assignment ledger |
| Dirty assigned files | 0 detected by ledger comparison |
| Tests examined / directly executed | 75 files / 362 tests: unit, integration, and contract (no assigned serial test) |
| Structural-lens tool failures | 0 |

The receipt is [read-receipt.tsv](read-receipt.tsv); exact commands and timing are in [commands.md](commands.md). Scope excludes transport-router source, client source, entry composition, and lifecycle source except where inspected as a cross-domain reach boundary.

## Findings

No confirmed P0–P3 defect is established in the assigned scope.

## Candidate observation — not a finding

Automation’s delivered API is not yet known to have a client consumer.

The automation router exposes ten ordinary `authedProcedure`s — `listRules`, `reorderRules`, `createRule`, `updateRule`, `setRuleEnabled`, `deleteRule`, `testRule`, `listFires`, `setBudgets`, and `getBudgets` — but the repository resolution-based `unwired` lens reports all ten as provider-minus-client (`packages/server/src/transport/trpc/routers/automation.ts:40`, `:44`, `:51`, `:66`, `:81`, `:85`, `:91`, `:96`, `:107`, `:124`).

This is R3, high-confidence wiring evidence across 369 procedures, corroborated by a literal scan of 1,369 client/test TS/TSX files with no `trpc.automation` (or bracketed namespace) reference. It does not rule out non-client callers and is not evidence that the domain service is unreachable: the service is composed at `packages/server/src/entry/compose/automation-plugin.ts:205`, and the automation domain has seven static importers including lifecycle/watcher/tRPC context. The client/product lanes must establish a browser-consumer requirement before synthesis can create a P1 finding.

## Evidence-backed positives

- Automation has both a production composition call and an event lifecycle import path: `pnpm ast callers createAutomationService` found the composed call at `packages/server/src/entry/compose/automation-plugin.ts:205`; `pnpm ast importers '#domain/automation'` found entry lifecycle/watcher imports. This is imported/called-live evidence, not a file-existence claim.
- The primary behavior suite for all three owned domains is green: 75 scoped files and 362 tests across unit, integration, and contract projects. This covers persistence, substrates, verbs, algorithm helpers, indexer handlers, and workload contributions represented by the assigned mirrored tests.
- The automation write edge validates trigger liveness, CEL parsing, action shapes, caps, cooldown floors, and world-book attachment before persistence (`packages/server/src/domain/automation/substrate/validate.ts:75` through `:104`); creation then host-gates and defaults a new rule disabled (`packages/server/src/domain/automation/verbs/create-rule.ts:15` through `:51`).
- Plugin event delivery has independent declared-trigger, cascade-depth, and visibility checks, catches both visibility and guest-delivery failures, and awaits delivery fan-out (`packages/server/src/domain/automation/substrate/plugin-subscribers.ts:113` through `:163`).

## Scorecard

Scores are independent five-point assessments; they are not averaged.

| Dimension | Score | Basis |
| - | - | - |
| Implementation | 4 / 5 | Typed validation, host gating, disabled-by-default create path, persistence suites, and green scoped behavior run. |
| Wiring | 2 / 5 | Server composition/watcher reach is real, but 10/10 automation browser procedures are not consumed by the client proxy; required browser reach remains unproven. |
| Verification | 4 / 5 | 75 files / 362 direct scoped tests passed, plus the test-membership check. No live external-service exercise was in scope. |
| Enforcement | 4 / 5 | Explicit injected ops and plugin fan-out’s fail-closed visibility/cascade controls are directly covered by domain tests. |
| Operability | 4 / 5 | Query, clear/prune/store, reader, algorithm, and workload suites execute green; no live multi-replica receipt was in scope. |

## Limits

The client proxy’s generated/type-level call surface and router implementation are outside the 191-file ownership set. The candidate observation is therefore a cross-boundary reach fact, not a claim that a specific owned implementation is wrong. No broad absence claim relies only on a timeout or an empty structural scan.
