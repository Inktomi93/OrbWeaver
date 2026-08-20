---
kind: design
status: active
updated: 2026-08-20
---

# Server usage settlement — variant provenance, imported estimates, and OpenRouter cost

Issues #290 and #291 are one accounting problem: a number is not usable until its origin survives from the
producer, through canon, into the aggregate and finally into the label a reader sees. This design therefore
settles token provenance and recorded cost together. It does not claim an external OpenRouter probe: this
lane had no `OPENROUTER_API_KEY`. The OpenRouter proof is a deterministic in-process wire-to-engine fence
whose input has the provider's real `usage.cost` shape.

## 1. Re-verified premises

The issue's original premise that SillyTavern preserves no usable token count is stale. The live parser
already reads `extra.token_count` and routes the row-text count by role (`server/kit/serde/chat`); the
2026-08-20 census of the inspected 1,097-file export corpus found 6,994 numeric primary-row counts and
23,088 numeric swipe-sidecar counts. The current SillyTavern source defines that field as the token count of
the row's own text, not the prompt/completion usage of the API call. No second exact input/output usage field
was found in the inspected export versions. Consequently:

- a recorded `token_count` is exact for that row text and is `measured`;
- it maps to `tokens_out` for an assistant row and `tokens_in` for a user/system row;
- a missing count is estimated from the imported row text and is `estimated`;
- a native row with neither recorded nor estimated accounting remains `unrecorded`.

The real database reconciliation in #289 found only 17 of 74,611 model-named variants with token columns
populated. The missing corpus includes all 8,713 Selene variants. This lane therefore cannot stop at fixing
future imports; it needs a catch-up pass over existing imported canon.

## 2. Chosen architecture

### 2.1 One provenance axis at variant grain

`@orb/contracts/chat` owns the canonical tuple, schema, and type:

```text
measured | estimated | unrecorded
```

`message_variants.token_provenance` is a NOT NULL checked column defaulting to `unrecorded`. The default is
the only safe birth state for writers that carry no usage. A live turn with either token column populated is
stamped `measured`; an ST count is stamped `measured`; the import estimator stamps `estimated`.

`MessageView`, the host variant view, bulk-import input, ST serde shape, and orb-native bundle shape carry the
same field. A legacy orb bundle that predates the field is read as `measured` when it carries a token number,
otherwise `unrecorded`; a newly written bundle emits the field. The ST writer emits `token_count` only for a
`measured` row. Re-exporting an estimate as an apparently exact ST count would launder provenance and is
therefore forbidden. The same contracts module owns `combineTokenProvenance`: estimates dominate a mixed
total, measured dominates absence, and every consumer uses that precedence instead of re-spelling it.

### 2.2 One import resolver, exact first

`domain/import/substrate/token-usage.ts` is the pure mapper shared by future-import mapping and catch-up. Its
order is:

1. accept a safe non-negative integer source count and route it by role as `measured`;
2. otherwise call the existing `@orb/kit/tokens.estimateTokens` on the imported row text, route the result by
   role, and stamp `estimated`;
3. never synthesize cost.

The `TOKENIZER_HEADROOM_FACTOR` / `safeTokenWindow` arm from #187 is deliberately not applied to the stored
estimate. That factor discounts a hard capacity window so an undercount cannot cause a 400; it is not a
calibrated tokenizer and multiplying a displayed count by its inverse would manufacture false precision.
The `estimated` provenance and `~N tok` rendering state the approximation honestly.

### 2.3 Catch-up is an import-owned workload over chat-owned CAS rails

A dedicated `import-token-usage-backfill` workload is singular and bulk-capable, supports `dryRun`, and
stores an owner/variant census in its terminal result. Import owns the ST interpretation and estimation loop;
chat owns the canon read and write operations. The workload receives injected chat ops that:

- keyset-page imported variants with role, content, metadata, existing token columns and provenance;
- compare-and-set one candidate only while its provenance is still `unrecorded` and its token columns still
  match the missing/legacy shape read by the worker.

For a legacy imported row that already has a token number, catch-up changes only provenance to `measured`.
For a missing row, it fills only NULL token columns and stamps `measured` (recoverable metadata
`token_count`) or `estimated` (text estimate) in the same statement. A later provider write that stamps
`measured` makes the predicate miss; an import rerun records the skip and cannot overwrite it. The terminal
result records scanned, exact-recovered, legacy-promoted, estimated, already-measured, already-estimated,
compare-and-set-skipped, owner and reconcile counts. That is the skip-with-record audit trail.

After changed rows, the contribution invokes the existing stats reconciliation op for each affected owner.
No live database or setting is touched by lane verification. The operational proof uses a scratch copy of
the real DB, applies only the new column shape to that copy, and runs the real workload contribution twice.

### 2.4 Rollups store reversible provenance evidence, not a lossy flag

A rollup cannot store only `token_provenance`. Selection changes and deletes are signed deltas: removing the
last estimated swipe must turn the remaining aggregate back from `estimated` to `measured`. The four rollup
tables therefore carry sample counters for each token axis:

```text
tokens_in_measured_samples      tokens_in_estimated_samples
tokens_out_measured_samples     tokens_out_estimated_samples
cost_samples
```

The owner, character, daily and model grains each store the counters appropriate to the same variants their
existing totals count. `StatsDelta` carries scalar, daily and model increments, including negative values.
The rebuild derives the same counters from canon. Read semantics are total and identical everywhere:

- any estimated samples on an axis => aggregate provenance `estimated`;
- otherwise any measured samples => `measured`;
- otherwise => `unrecorded` and the numeric field is returned as `null`;
- `cost_usd` is returned only when `cost_samples > 0`; token presence never turns absent cost into `$0.00`.

This preserves a real measured zero for local models, labels a mixed exact/estimated sum as approximate, and
never invents a dollar estimate. Direct stats-owned economics projections use the same sample-count rule.

### 2.5 Rendering

Per-message metadata renders `~N tok` only for `estimated`, `N tok` for `measured`, and nothing for
`unrecorded`. Stats token formatters take the aggregate provenance and apply the same tilde; token-derived
throughput/cache rates and the daily-token chart use the same approximate/unrecorded spelling. The
stats-owned discovery economics seam also carries provenance so the corpus gem shelf cannot relabel an
imported estimate as exact or draw an unrecorded comparison bar. Stats views carry separate input/output
provenance because a user row can measure input while an assistant row measures output. Cost remains
nullable and has no estimated spelling; absent-cost model routes are omitted rather than coerced to `$0.00`.

### 2.6 OpenRouter settlement fence

The #291 test starts with a provider-shaped chat-completions result whose usage contains prompt tokens,
completion tokens and `cost`. It runs the production OpenAI-compatible mapper, the production
`createRunChatTurnBridge`, and the real chat engine. It then asserts the committed
`message_variants.cost_usd`, the measured token provenance, and the applied `model_stats.cost_usd` plus
`cost_samples`. The compose bridge stamps the resolved credential source as the provider; this is the
missing live provenance carrier the earlier test hid by injecting `provider: "openrouter"` into an already
translated terminal chunk.

## 3. Rejected alternatives

1. **One aggregate provenance flag.** Rejected because signed swipe/delete deltas cannot know whether the
   removed row was the last estimate. It becomes permanently sticky or requires a canon rescan per write.
2. **Infer recordedness from `generations` or a positive token total.** Rejected because measured zero is
   real and estimated token presence says nothing about whether cost was reported. This is the current
   `$0.00` fabrication path.
3. **Estimate through `safeTokenWindow` or multiply by `1 / 0.7`.** Rejected because #187's factor is a hard
   window safety margin, not a tokenizer calibration. Provenance is the correct honesty mechanism.
4. **Put the backfill SQL directly in import.** Rejected because `message_variants` is chat-owned canon.
   Import interprets; chat exposes a bounded read/CAS seam and remains the only writer.
5. **Fold catch-up invisibly into `import-st`.** Rejected because existing canon must be repairable without
   re-reading or retaining an ST profile tree, and an auditable maintenance result deserves its own run row.
6. **A synthetic OpenRouter `TurnStreamChunk`.** Rejected because it begins after `usage.cost` has already
   been translated—the exact seam #291 needs to fence.

## 4. Coupled-site inventory

The shape fans through these sites and their tests:

- contracts: chat message/bulk-import carriers, stats delta/economics, workload kind/params/result;
- db: chat variant column/check, all four rollup tables, pre-launch baseline and schema census;
- import: ST serde exact field, import mapper, orb bundle compatibility, backfill loop/result;
- chat: canon/import writers, message/variant reads, fork/export carriers, stats delete/swap reads;
- stats: delta builders, live upsert, reconcile folds/insert widths, rollup/economics reads;
- compose: import workload dependencies, workload registry, provider-to-domain bridge;
- client: workload label/param/result records, message metadata, analytics view-model and token consumers;
- shared-value gates: every `WorkloadKind` exhaustive record, token-provenance literals across tests,
  schema enum/check lists, both server/client program imports.

## 5. Red-first and verification plan

Red-first tests pin:

- contract/schema exact members and DB rejection outside the three-member axis;
- ST exact count => measured, absent count => estimated through `estimateTokens`, and estimated ST export
  does not launder a `token_count`;
- bulk import and native bundle carry provenance;
- catch-up exact recovery, estimate, legacy promotion, NULL-only CAS, measured-wins race, dry-run, audit
  counts and a zero-change second pass;
- live delta equals rebuild for token sample counters and cost samples;
- stats reads distinguish measured zero, estimated totals, unrecorded totals and unrecorded cost;
- message and analytics CT render `~N tok` and keep `—`/no-row behavior for unrecorded;
- raw OpenRouter `usage.cost` reaches variant and model rollup through mapper + bridge + real engine.

The behavioral tier is the focused contract/kit/db/server integration/client CT suites above. Graduation also
runs all three TypeScript programs, touched Biome/ESLint, docs checks, schema/structure/knip gates, AST and
literal shared-value sweeps, migration consistency, and a scratch-real-corpus workload proof using the
largest safe corpus representation. The whole-tree battery is intentionally left to the orchestrator.

## 6. Owner forks

None remain. The owner already ruled the provenance members, estimate posture, NULL-only/idempotent
backfill, measured-wins order, approximate label and maximal architecture. No prose-default text or persona
semantics is changed.
