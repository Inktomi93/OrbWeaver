---
kind: review
status: archived
updated: 2026-08-30
---

# Server usage settlement repair — stickler follow-up

## Verdict

**CONFIRMED — zero confirmed findings.** Candidate `05734864dd5a7b8c661c1c42fd14b020f52f2845`
repairs all six findings from the prior HOLD. The stack is suitable for #290 to move to Review. #291 must
remain open: its done bar requires an actual live OpenRouter turn whose settled cost lands in
`model_stats`, and this review had no external OpenRouter key.

The review used a clean synthetic tree rooted at current main `2895946d810415f85c5bb001d27af60d396660be`.
The candidate stack replayed without conflicts as:

- `0dee00a23` → `74b817ed7`
- `6e7293e41` → `203b73bdd`
- `768af7dc0` → `d3814ecc4`
- `1ad770de5` → `7fe5edd51`
- `746d686e0` → `18f4aa28f`
- `05734864d` → synthetic source tip `03e8127ca8141e7b1d25b49e6cbde3b815a13d26`

`git diff --check 2895946d8..03e8127ca` passed. The original candidate worktree remained clean at
`05734864dd5a7b8c661c1c42fd14b020f52f2845`.

## Confirmed findings

None.

## Prior HOLD findings — explicit repair verification

### Provider absence, partial usage, genuine zero, and absent cost

The provider contract now represents token axes and total cost as nullable
(`packages/server/src/infra/providers/contract/chat.ts:226-240`). Both production mappers preserve absence
instead of manufacturing zero: chat-completions maps optional prompt/completion tokens and cost to null
(`packages/server/src/infra/providers/backends/kit/openai-compat/stream.ts:143-158`), and the Responses
mapper does the same (`packages/server/src/infra/providers/backends/openrouter/runners/chat/responses.ts:312-327`).

The planted end-to-end control uses a raw `ChatCompletionResult`, the production mapper, the real turn
bridge/engine, canon persistence, and real model-delta application. Its table distinguishes all four
load-bearing states (`tests/server/domain/chat/engine/engine-stats.suite.int.test.ts:451-502`):

- omitted usage → null/null, `unrecorded`, null cost, zero token/cost samples;
- one missing token axis → the present axis remains measured and the absent axis gets no sample;
- provider-reported 0/0 and zero cost → measured zeroes and one sample for each reported value;
- measured tokens without cost → token samples but no cost sample.

Command:

```text
pnpm vitest run \
  tests/server/infra/providers/backends/kit/openai-compat/stream.test.ts \
  tests/server/infra/providers/backends/openrouter/runners/chat/responses.test.ts \
  tests/server/domain/chat/engine/engine-stats.suite.int.test.ts \
  tests/server/domain/chat/persistence/token-usage-backfill.int.test.ts \
  tests/server/domain/chat/substrate/stats-delta.test.ts \
  tests/server/domain/stats/write/drift-gate.suite.int.test.ts \
  tests/server/domain/import/verbs/backfill-token-usage.int.test.ts \
  tests/server/domain/import/workload-contributions.test.ts \
  tests/server/kit/serde/chat-bundle/index.test.ts \
  tests/client/features/workloads/lib/workloads-result-copy.test.ts
```

Result: **10 files passed, 103 tests passed**.

### Nullable-axis live/rebuild parity

`canonMessageDelta` uses `?? 0` only for additive totals while passing the original nullable axes into
both owner/day and model sample slices (`packages/server/src/domain/chat/substrate/stats-delta.ts:262-323`).
`canonModelSlice` accepts nullable axes and counts each independently
(`packages/server/src/domain/chat/substrate/stats-delta.ts:328-351`). The drift gate plants an output-only
agent-authored assistant variant (`tests/server/domain/stats/write/drift-gate.suite.int.test.ts:66-76`),
rebuilds from canon, independently replays live deltas, and compares all rollups byte-for-byte while
pinning non-empty owner/character state (`tests/server/domain/stats/write/drift-gate.suite.int.test.ts:275-299`).
The gate passed in the 103-test battery above.

### Content and metadata compare-and-set races

The backfill update now predicates the candidate's content and uses null-safe equality for metadata in
addition to provenance and both token axes
(`packages/server/src/domain/chat/persistence/token-usage-backfill.ts:52-76`). The integration test mutates
content and metadata after candidate selection and proves both stale updates return false
(`tests/server/domain/chat/persistence/token-usage-backfill.int.test.ts:50-99`). It also retains the
measured-wins race and second-run idempotency controls at lines 84-90. The test passed in the 103-test
battery.

### Portable contradiction refusal and legacy compatibility

The wire schema rejects explicit `unrecorded` provenance paired with any numeric token axis and rejects
explicit `measured`/`estimated` provenance when both axes are absent, while intentionally leaving omitted
provenance to the compatibility derivation
(`packages/server/src/kit/serde/chat-bundle/index.ts:210-242`). The real parser test proves both explicit
contradictions refuse as `malformed`, omitted provenance plus a numeric axis derives `measured`, and omitted
provenance plus no axes derives `unrecorded`
(`tests/server/kit/serde/chat-bundle/index.test.ts:167-197`). The test passed in the 103-test battery.

### Exact three-file component-test comparison

The exact candidate and current-main baseline commands were identical:

```text
pnpm exec playwright test -c playwright-ct.config.ts \
  tests/client/features/app-shell/surfaces/app-shell.ct.tsx \
  tests/client/features/chat/components/message-row.ct.tsx \
  tests/client/features/chat/components/variant-wire-viewer.ct.tsx
```

Both trees produced **304 passed, 3 failed, 0 flaky, 0 skipped**. The failures match exactly:

- `app-shell.ct.tsx:1249` — O-19 Presets list/context pane;
- `app-shell.ct.tsx:3110` — floating sheet elevation;
- `app-shell.ct.tsx:3135` — ember docked cue.

Neither message-row nor variant-wire-viewer failed. The ten-pass increase from the older receipt is shared
by current main, so none of these three failures intersects the candidate.

### Singular/plural workload audit copy

`countIfAny` now accepts an explicit plural and delegates the one-vs-many decision to `count`
(`packages/client/src/features/workloads/lib/workloads-result-copy.ts:28-38`). The settlement summary supplies
`exact count recovered` / `exact counts recovered` and the equivalent legacy phrase
(`packages/client/src/features/workloads/lib/workloads-result-copy.ts:151-159`). Its tests pin both
`2 exact counts recovered` and `1 exact count recovered`
(`tests/client/features/workloads/lib/workloads-result-copy.test.ts:29-48`); they passed in the 103-test
battery.

## Coupled-regression review

### Nullable `ChatUsage`

The contract widening was checked against the whole TypeScript graph. Direct-property AST sweeps scanned
4,077 TS files and 1,125 TSX files (112/3 `tokensIn` hits respectively; companion `tokensOut` and
`costUsd` sweeps were also inspected), and the packages, graph, test declaration, DOM-test, and membership
TypeScript programs all passed. No consumer retained an invalid numeric-only assumption.

### Probe-script coalescing

The four modified SDK probes use `?? 0` only to preserve their explicitly numeric report shapes. They all
consume the agent-SDK reducer, whose accumulator starts numeric at zero and whose result-frame path adds the
SDK's required numeric `modelUsage` fields before returning them
(`packages/server/src/infra/providers/backends/agent-sdk/runner.ts:457-480`, `:518-523`, `:786-803`). Thus
the new coalescing is unreachable on that backend's successful result path and does not collapse provider
absence. All four scripts passed Biome and the three applicable TypeScript programs.

## Static, schema, documentation, and provenance verification

- `pnpm typecheck`, `pnpm typecheck:graph`, and `pnpm typecheck:tests-dom`: passed.
- `pnpm check:db-baseline`: passed, **226 live schema statements = 226 baseline statements**.
- `pnpm check:drizzle-kit`: passed (`Everything's fine`).
- `pnpm check:structure`: passed all rules over 5,079 files; 222 pre-existing ratcheted findings were
  admitted, and the final verdict was clean.
- Scoped `pnpm exec biome check` over the 20 repaired source/test/script files: passed.
- Scoped `pnpm check:docs` over the settlement design and receipt: passed.
- `jq empty` over the three changed catalog JSON files: passed.
- Full `pnpm check`: Biome, ESLint, all six type arms, execution-membership, baseline, Drizzle, agent config,
  full structure, dep-cruise, Knip, and docs formatting passed. Its sole red stage was docs catalog in the
  synthetic tree because cherry-picking necessarily changed commit ancestry.
- The ancestry artifact was independently refuted on the untouched original candidate: `pnpm
  check:doc-catalog` passed with **644 documents and 2 pending fact-checks**;
  `746d686e0` is an ancestor of `05734864d`; and the synthetic design/receipt SHA-256 values exactly match
  the original candidate (`f4a57a60...e75ad` and `d9554791...b114`). Catalog entries report both receipts
  current.
- `git diff --check 2895946d8..03e8127ca`: passed.

## Scope and remaining external proof

The prior HOLD report and every repaired hand-authored file were read in full. Generated catalog JSON was
validated structurally and its two settlement entries were inspected in full; it was not reviewed as
line-oriented prose. No repaired hand-authored region was excluded. The review used isolated scratch
databases only and did not touch live data, settings, Project state, main, origin, or the candidate tree.
It did not run the full component-test corpus beyond the exact three-file comparison, did not launch a live
browser, and did not make a real provider request.

Issues #290 and #291 were both OPEN at review time. `OPENROUTER_API_KEY` was absent. The production path and
provider-shaped integration control establish that a supplied OpenRouter cost can settle into model stats,
but that is not #291's required proof that a real externally keyed turn supplies and lands the value. #291
therefore stays open without qualification.

## Unconfirmed suspicions

None.

## Issue summary

CONFIRMED with zero findings (severity ceiling: none): candidate `05734864d` repairs all six prior HOLD
findings, passes the 103-test settlement battery, exactly matches current main's 304-pass/3-fail three-file
CT baseline, and clears all fresh static/schema/structure checks except the expected synthetic-cherry-pick
catalog ancestry artifact, which passes on the untouched original candidate. #290 can move to Review. #291
remains open because no external OpenRouter key/live turn was available. Durable report:
`docs/history/reviews/stickler/2026-08-20-server-usage-settlement-repair.md`.
