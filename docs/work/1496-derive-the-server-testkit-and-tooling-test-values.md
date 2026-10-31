---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-foundation
---

# Derive the server, testkit and tooling test values the derivation audit found copied

## What

The same audit's shard-b report (reports/test-derivation-audit/shard-b.md). P2: the data-layout cross-device case that runs zero times if two LEGACY_ENTRIES names change (migrate-data-layout.int.test.ts:274); hand-listed rosters of RPG config knobs, host-gated RPG verbs and chat read verbs (update-config, authority.suite, read-gates); the seed-theme COLOR_FIELDS table. P3: the plugin provider-id prefix in six files, the secret-box key, unseeded mintTypeId calls, the summarizer reply format written nine times, nine bare rejects.toThrow() refusals, direct row reads in surface-data.int.test.ts, the planted tsconfig block in the unwired tooling tests.

Scope is the whole file, not only the audit rows. Rewrite each test file the newest additions touched onto the testkit: every helper a file defines locally moves to its testkit home under `tests/support/` in the right world (`iso`, `node`, `browser`) and is published through the door its callers need, with duplicates merged to one; every value, roster, table and shape derives from production; every seed runs a production verb, a root seed or a corpus builder; every case mounts the real door. A file whose cases already meet this is left alone.

## Why

Spine-Testing sections 3 and 9; each P2 lets a new verb, knob or entry go untested.

## Done when

No test file in scope defines a helper that belongs in the testkit or another file already defines. Every shard-b row is fixed or ruled with a cited reason; each roster is an exhaustive Record over the production union or derived from the production registry so a new member fails tsc; the zero-run case fails when its entries are renamed; repeated helpers have one testkit home.

## Evidence

Filled at landing: what ran and where its output is.
