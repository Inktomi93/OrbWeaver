---
kind: review
status: archived
updated: 2026-08-30
---

# Server usage settlement receipt — #290 + #291

## Scope and honesty boundary

This receipt covers the variant-grain token provenance/import backfill and provider-cost settlement built
from `docs/design/server-usage-settlement-2026-08-20.md`. No `OPENROUTER_API_KEY` was available. The
OpenRouter evidence is therefore the deterministic production mapper → production bridge → real engine →
canon/rollup integration fence; it is not described as an external live call.

The operational corpus run used a SQLite online backup from the live database opened with
`mode=ro`. Every schema change and workload write targeted
`/tmp/orb-token-settlement-final.GiVRLm/orbweaver-scratch.db`. No settings file was read. After the probe, read-only
`pragma_table_info` checks on the live source still reported zero `message_variants.token_provenance`
columns and zero owner-stats sample columns; its database/WAL size and mtimes remained
`472301568 @ 2026-08-20 12:31:27 -0600` and `4120032 @ 2026-08-20 16:25:11 -0600`.

## Real-corpus scratch proof

The online backup completed at 472,301,568 bytes and passed `PRAGMA integrity_check` before mutation. The
scratch-only schema augmentation added the new provenance column and the five sample columns to each
rollup table. The imported-chat census before the workload was:

| Fact | Count |
| - | -: |
| Imported variants scanned through a non-null host | 87,922 |
| Both token columns NULL | 61,842 |
| Legacy numeric token rows | 26,080 |
| Longest imported variant body | 264,241 bytes |

The longest real row was from `Ruby - 2026-01-29@22h03m08s307ms.jsonl`. It completed as `measured` with
76,881 input tokens already present in legacy canon; the workload promoted provenance without rewriting
that value. This exercises the longest represented imported row safely without printing its content.

The first real workload pass, using the final production factory plus production listing, CAS, estimate and
reconcile operations, returned:

```json
{"scanned":87922,"exactRecovered":0,"legacyPromoted":26080,"estimated":61842,"alreadyMeasured":0,"alreadyEstimated":0,"compareAndSetSkipped":0,"ownersScanned":1,"ownersReconciled":1,"dryRun":false}
```

`exactRecovered: 0` is a successful refusal, not a missing arm: this stored corpus had already materialized
every recoverable source `token_count` into one of the 26,080 legacy numeric rows. The workload did not
invent a second exact field; it promoted those rows and estimated only the 61,842 NULL pairs.

The immediate second pass returned:

```json
{"scanned":87922,"exactRecovered":0,"legacyPromoted":0,"estimated":0,"alreadyMeasured":26080,"alreadyEstimated":61842,"compareAndSetSkipped":0,"ownersScanned":1,"ownersReconciled":0,"dryRun":false}
```

That is the idempotency receipt: zero writes and zero owner reconciliations on pass two.

For the measured-wins planted control, one real estimated scratch row was reset to the pre-catch-up NULL /
`unrecorded` shape, captured as the stale worker candidate, then updated by the simulated live writer to
`tokensIn: 123`, `tokensOut: 456`, `measured`. The production CAS returned `false`, and its final read was:

```json
{"tokensIn":123,"tokensOut":456,"tokenProvenance":"measured"}
```

The post-control imported census was 61,841 estimated + 26,081 measured, with no imported unrecorded rows.
The scratch database was reconciled again and `PRAGMA integrity_check` returned `ok`.

## Behavioral receipts

- Red-first: 5 files failed, 11 tests failed and 115 passed across contracts, serde, import mapping, stats
  semantics and client formatting before implementation.
- Provider fence: `tests/server/domain/chat/engine/engine-stats.suite.int.test.ts` — 9/9 passed. Its #291 arm
  starts at provider-shaped `usage.cost`, then asserts measured variant usage/provider and model cost/sample
  rollup. The stickler repair added production-mapper → real-engine cases for an absent usage object, one
  missing token axis, genuine reported zeroes, and recorded tokens without cost; canon and model sample
  counters preserve every distinction.
- Backfill: workload unit tests 24/24 and chat persistence integration 2/2 passed; the full DB-backed
  backfill/idempotency test passed 1/1. A final post-structure focused run passed 32/32 across those three
  surfaces plus the engine fence.
- Stats: 148/148 passed across 31 focused files after the provenance-aware fixtures and direct estimated /
  unrecorded cost controls were installed.
- Contracts/schema/import: 165/165 passed across 9 focused files. A separate chat/export/router carrier run
  passed 168/168 across 10 files.
- Client: the final bounded message metadata + corpus + overview + time component run passed 44/44,
  including `~128 tok`, estimated daily-chart values, hidden unrecorded counts/bars, and absent-cost route
  filtering. A preceding `pnpm test:ct -- <paths>` invocation retained the separator and unexpectedly ran
  the whole CT tree: 3,554 passed and 9 failures. Stickler comparison proved six message-row/variant-wire
  failures were candidate-induced by a fixture that combined numeric tokens with `unrecorded`; the fixture
  now derives coherent provenance. The exact three-file rerun passes 294 tests and retains only the three
  app-shell panel-mode failures reproduced on the clean parent. The accidental scope violation is recorded
  here and is not used as the lane's pass evidence.
- Final focused settlement run: 100/100 passed across the canonical provenance contract, formatter,
  discovery economics, stats rates, backfill persistence/workload and real-engine provider fence.
- Stickler repair run: 103/103 passed across ten exact provider, engine, live-vs-rebuild drift, backfill
  CAS/workload, portable serde, and workload-copy files. Content-only and metadata-only races now lose the
  CAS; explicit contradictory portable states refuse as malformed while legacy files without a provenance
  field still derive deterministically; singular audit copy renders `1 exact count recovered`.
- Database: baseline parity reported 226 live-schema statements vs 226 baseline statements; drizzle-kit
  reported `Everything's fine`.

## Final lane gates

- `pnpm typecheck`, `pnpm typecheck:graph`, and `pnpm typecheck:tests-dom`: all passed after the final
  structural repair.
- Touched Biome passed across 89 files and source ESLint passed across 55 configured package files with
  zero diagnostics; docs formatting passed for 104 files. A broader ESLint attempt included 28 test files
  outside this repository's ESLint configuration and was discarded as invalid evidence.
- `pnpm check:structure`: all gates clean across 5,078 files; 222 pre-existing ratchet-admitted findings were
  reported as declared debt. `pnpm knip` passed.
- AST three-shape `tokenProvenance` sweep over 3,731 TypeScript and 1,124 TSX files: TS direct 36, optional 2,
  bracket 0; TSX direct 2, optional 0, bracket 0. Literal cross-checks found the axis across 47 package/test
  files; the workload kind across 11; `costSamples` across 11; quoted `measured` / `estimated` /
  `unrecorded` across 33 / 22 / 33 files.
- `pnpm check:db-baseline`: 226/226 statements. `pnpm check:drizzle-kit` and `pnpm check:docs` passed. The
  pre-commit catalog check correctly requires receipt rows for these two new documents; they are generated
  and truth-bound only after the documents have a commit blob, in the law-required stacked catalog commit.
- `git diff --check`: passed after the final diff inspection.
