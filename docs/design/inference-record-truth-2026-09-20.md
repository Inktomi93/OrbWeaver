---
kind: design
status: active
updated: 2026-09-20
---

# Inference record truth — the design behind lane `cb-audit-record`

The build record for rows A4 · A5 · A6 · A8 · B1 · B3 · B5 · B6 · B7 · B8 · H1(a) · H2 · H3 of
[`../reviews/stickler/2026-09-19-inference-ai-sdk-integration-audit.md`](../reviews/stickler/2026-09-19-inference-ai-sdk-integration-audit.md).
Written BEFORE the edits (phase 1 → phase 2); the code is the doc from here on, this file is the delta and the
reasoning. Program law: [`orbweaver-inference-package.md`](orbweaver-inference-package.md) §5.3b/§5.3c
(the record), §6.2 (the evidence ladder), §8.7 (presets across providers), §15c-18 (the BUILD LOG — one
bullet per deviation lands there). Memory lessons used (by filename): `new-db-table-four-site-landing`,
`allow-list-blind-inside-json-column` (the `Required<$inferInsert>` ratchet is why a column add fans out to
`fork.ts`), `not-null-default-defeats-cross-field-refine` (why every new column is NULLABLE with no default),
`parse-on-read-schemas-cannot-be-tightened`, `retiring-a-union-member-is-a-tsc-map-plus-literal-grep`,
`lock-the-extensible-shape`, `new-doc-catalog-two-commit-stack` (why this file ships without a receipt).

## 0. Premises re-derived against the tree (the audit is a day old; ~50% stale-row rate is the repo norm)

| Premise (brief / audit) | Tree today | Verdict |
| - | - | - |
| A5 "surface `stopDetails` as a `refusal` event" needs a NEW `ChatEvent` member | `contract/events.ts:85-94` already carries `refusal {model, category, explanation, retried, fallbackModel}`, emitted by `agent-sdk/runner.ts:607` | KILLED — no `events.ts` edit; the anthropic wire emits the EXISTING member |
| B3 "a dated `measured/openrouter.ts` `sampling: {}` row outranks the OR advertisement" | `capability/synthesize.ts:526-529` merges `sampling` ONE LEVEL DEEP: `{...advertised, ...{}}` is the advertised set — an empty patch cannot subtract | KILLED — `sampling` must be a REPLACE key (§2.1) |
| the measured tier is a matched row set like curated | `resolve/resolve-task.ts:185` hands `MEASURED_ANTHROPIC` WHOLESALE to every anthropic-family id (`synthesize.ts:571-574` merges every row, no `match`) | KILLED — a measured loader with `match` semantics (§2.2) |
| a curated cell exists for every SDK-table Claude id | `curated/anthropic.ts` regexes end at `opus-4[-.]8`; `claude-opus-5` resolves as `reasoning.mode: "none"` on the direct wire | KILLED — an opus-5 row is added |
| B6 "OR sends `x-ratelimit-*`" | probe 2026-09-20 `gen-1789884256-ZeulFgkGknjAbAgCKe1S`: NO rate-limit header on a 200 | REFUTED for OR-on-200; Anthropic + direct OpenAI send theirs (§2.6) |
| H2 UNMEASURED | owner added `OPENAI_PROBE_KEY`; measured (§2.9) | MEASURED — arm (a) |
| B7 "store the response id on every hosted wire" is record-only | `client/features/chat/components/message-metadata-row.tsx:151` + `message-cost-readout.tsx:42-47` show the reveal affordance on `generationId !== null`; `generationCost` → `openai-compat/diagnostics.ts:requireOpenRouter` refuses a non-OR row | PARTIAL — B7 lands; the client gate is a named follow-up (§4) |
| A6 "curated cells carry `structured: true`" is missing | the base anthropic row `curated/anthropic.ts:33` already states `output.structured: true` and `family-floor.ts:40` ORs it in | ALREADY TRUE — only the table pin is owed |
| A8 "`mandatory: true` on fable/mythos" | `funnel/resolve-chat.ts:307-318` already clamps a `mandatory` model; the cell lacks the flag | HOLDS — a data edit, no funnel change |

## 1. Measured 2026-09-20 (scratch script `rec-probe.mjs`, SDK dists called directly, `maxOutputTokens: 60`)

| Probe | Receipt | Fact |
| - | - | - |
| direct `claude-fable-5-1`, `thinking: disabled` | `req_011CfEBkabcoxXWyouHdYDxY` | 400 `"thinking.type.disabled" is not supported for this model` — A8 mandatory confirmed |
| direct `claude-fable-5-1`, adaptive + `effort: low` | `req_011CfEBkc6AP4LKtUi1pwaUZ` | 200; `providerMetadata.anthropic = {usage, stopSequence, iterations: null, container, contextManagement}` |
| direct `claude-opus-4-5-20251101` | `req_011CfEBkpjRWAjtLDifB2qpW` · `msg_011CfEBkq13YCxSrpf1a13Do` | `response.headers` carries `anthropic-ratelimit-{requests,tokens,input-tokens,output-tokens}-{limit,remaining,reset}` (RFC 3339 resets) + `request-id`; `response-metadata.id` is the `msg_…` handle (B7) |
| OR `anthropic/claude-opus-5`, `temperature 0.7 + topP 0.9`, echo | `gen-1789884252-n94Ebcm1uMVMG1XhxsbB` | upstream body has NO `temperature`/`top_p` (`{messages, thinking:{adaptive, summarized}, model, stream, metadata, max_tokens, stop_sequences}`) — B3 confirmed |
| OR `anthropic/claude-opus-4.8`, same | `gen-1789884543-OomBi0lVg4zDXFmCZ3Pk` | same strip; OR sends `thinking: {type: disabled}` by default for 4.8 |
| OR `openai/gpt-5.4`, `extraBody.verbosity: low` + `temperature 0.7`, echo | `gen-1789884254-ZJVqE4m5N0aChJ7FY0x7` | Responses body carries `text.verbosity: "low"`, `reasoning: {effort: none, summary: detailed}`, `include: [reasoning.encrypted_content]`, `store: false`; `temperature` stripped silently — H1/H3 confirmed |
| OR `anthropic/claude-haiku-4.5`, `usage.include` | `gen-1789884256-ZeulFgkGknjAbAgCKe1S` | `providerMetadata.openrouter.usage = {promptTokens, completionTokens, completionTokensDetails.reasoningTokens, totalTokens, cost, costDetails.upstreamInferenceCost}`; the V4 `usage.raw` ALSO carries `cost_details.upstream_inference_prompt_cost` / `upstream_inference_completions_cost` and `is_byok` (the SDK maps neither) — A4's per-phase split lives on `usage.raw` |
| OR catalog `GET /models` | public | `supported_parameters` lists `temperature` for `claude-opus-5` and `claude-opus-4.8` ONLY (both stripped upstream); `fable-5`/`fable-5.1`/`sonnet-5`/`opus-4.7` are advertised WITHOUT it (correct); `verbosity` is listed on EVERY Claude id and NOT on `openai/gpt-5.4` (the inversion) |
| direct OpenAI `gpt-5-mini` (shim), `maxOutputTokens` | `req_f68c8dc2e4a24908a2e5be64132edbc0` | 400 `unsupported_parameter: max_tokens … Use 'max_completion_tokens'`; headers carry `x-ratelimit-{limit,remaining,reset}-{requests,tokens}` with duration-string resets (`120ms`) |
| direct OpenAI `gpt-5-mini`, `temperature: 0.7` | `req_4609158162fd4953b00a62cf6f23d82f` | 400 `unsupported_value: temperature … Only the default (1) value is supported` |
| direct OpenAI `gpt-5-mini`, `max_completion_tokens` via `providerOptions.openai` + `reasoning: low` | `req_8eff1a4cbff5461b820f47331f2c26b2` | 200 "ok" — the shim + a renamed cap + `reasoning_effort` is a working chat-completions turn |

Not measurable here: an OR BYOK account (`is_byok: false` on every probe) — the BYOK arm of A4 is pinned by a fixture
shaped per the installed `@openrouter/ai-sdk-provider` package's own README and dist schema
(`node_modules/@openrouter/ai-sdk-provider/{README.md,dist/index.js:3399-3400, 3994-3998}`); a Fable classifier block (not triggered on purpose) —
A5's fold is pinned over the dist's `mapAnthropicStopDetails` shape (`@ai-sdk/anthropic/dist/index.js:5855-5875, 6140-6150`).

## 2. The architecture, per row

### 2.1 `sampling` is a stated SET, not a patch (B3 · H3 · the D68 fail-closed rule)

**Chosen:** `capability/synthesize.ts` drops `sampling` from `NESTED_GENERATION_KEYS`; a tier that states
`sampling` REPLACES the set beneath it (arrays already replace; `reasoning`/`output`/`context`/`turns` keep the
one-level merge). WHY: the block's meaning is "which knobs EXIST" (§8.7 step 2 — absent ⇒ not honoured), and a
patch grammar cannot express a measured absence; §8.7's `declared.sampling` checkbox list ("this server honours…")
and D68's "absence means the knob does not render" both already assume set semantics. Under the old merge a
`declared: { sampling: { temperature } }` silently KEPT every advertised knob — the latent defect this fixes.
**Rejected:** (a) `false` as a per-knob "measured absent" marker — a schema widening in `contracts/inference/capability/generation.ts`
with a client capability-panel fan-out, for a semantics replace already gives; (b) tier-dependent merge (replace only
above `advertised`) — two merge laws in one fold, unteachable. **Coupled sites:** only `curated/anthropic.ts` carries
`sampling` rows (grep of `capability/**`: the `exclusive` row scoped `wire: anthropic-messages`, the agent-sdk `{}` row);
the anthropic file's order keeps the `exclusive` row LAST so it is the direct wire's stated set. Pin: red-first in
`tests/inference/capability/synthesize.test.ts`.

### 2.2 The measured tier gets a loader with `match` semantics

**Chosen:** extract the curated compiler/matcher (`compile` · `matches`) into `capability/sources/rows.ts`
(`compileRows`, `matchingRows`); `curated/loader.ts` uses it (a pure refactor, same exports); NEW `measured/loader.ts`
composes `measuredAnthropicRows` + `measuredOpenRouterRows` and exports `measuredRows(query)`; `resolve-task.ts:185`
reads `measuredRows({ model, providerId, wire, api })` (the `family ===` gate becomes the rows' own `match`).
`measured/anthropic.ts` keeps its name/header but takes the curated AUTHORING form (`as const satisfies readonly
CapabilityOverrideInput[]`, zod-parsed at load) so a typo is a `tsc` error and a malformed row a boot failure — the
§15c-18 "data rows are `.ts`" rule. **Rejected:** a per-family measured constant keyed by `providerId` — a second
matching vocabulary beside `match`, and a row measured THROUGH a route (OpenRouter) is not a family fact.
**Rows (dated, script-named, id-quoted — the §4 measured contract):** `measured/openrouter.ts`:
`match: { provider: "openrouter", model: "^anthropic/claude-opus-5" }` and `"^anthropic/claude-opus-4[-.]8"` →
`generation.sampling: {}` (§1's two echo receipts). `measured/anthropic.ts` stays EMPTY: A8's fact is placed on the
curated fable/mythos cell as the brief instructs, with the two request ids in its `cite` (one home, not two).

### 2.3 Curated Anthropic cells (A6 · A8 · B3-direct · H3)

- NEW `opus-5` row (`^(anthropic/)?claude[-/].*opus-5`): `reasoning: { mode: adaptive, enabled, effortLevels: [low, medium, high, xhigh, max] }`,
  `sampling: {}`, cite the SDK table `@ai-sdk/anthropic/dist/index.js:5943-5953`. `rejectsThinkingDisabledAboveHighEffort`
  needs NO `mandatory`: our wire sends `effort` only when reasoning is ENABLED (`anthropic-messages/chat.ts:154`), so the
  disabled+xhigh combination the SDK lowers is unreachable — said here so nobody re-derives it.
- `sampling: {}` + the SDK-table cite on `opus-4[-.]7`, `opus-4[-.]8`, `fable|mythos-5`, and a NEW `sonnet-5`-only row
  (the shared `sonnet-(5|4.6|4.5)` reasoning row stays; 4.5/4.6 have `rejectsSamplingParameters: false`, so they are
  deliberately NOT given the empty set — the direct wire stays D68 fail-closed for them regardless).
- `mandatory: true` on the fable/mythos cell (A8) — the funnel's `clampMandatoryEffort` then clamps `none`/absent
  UP with `reasoning_mandatory_clamp`, on both wires (OR measured the same refusal; the replay belt becomes a
  belt, not the path).
- A6: `output.structured` is already `true` for every Claude id; the pin is a table over
  `createRoleClientsFor(...).structured()` with a scripted executor: no fable / opus-5 / opus-4.7+ / sonnet-5 id
  resolves the `forced-tool` vehicle under `auto`.

### 2.4 H1(a) — `verbosity` is never derived from OR's `supported_parameters`

`advertised/openrouter.ts` drops the `verbosity` spread. The curated `openai.ts` row already states
`verbosity: [low, medium, high]` for `^(openai/)?(gpt-|o[13]|chatgpt)`, so gpt-5 KEEPS it; no Claude row states it, so
`anthropic/claude-opus-5` via OR resolves NONE and the funnel drops a preset verbosity with `verbosity_dropped`
(correct — Anthropic has no such knob). Pins in a new `tests/inference/capability/sources/advertised/openrouter.test.ts`
(red-first: the old source grants it) and the resolver-level B3/H1 pins in `measured/loader.test.ts`.

### 2.5 A4 — cost provenance on OpenRouter, BYOK included

`contracts/inference/usage.ts`: `costDetailsSchema = { totalUsd, promptUsd?, completionUsd?, upstreamUsd?, gatewayUsd? }`
(zod-first; `CostDetails = z.infer`). DEVIATION from the brief's spelling (`promptUsd`/`completionUsd` required):
the per-phase split is known only where a wire REPORTS one (OR's `usage.raw.cost_details.upstream_inference_{prompt,completions}_cost`)
or where the `estimated` arm derives it from per-MTok pricing; Anthropic reports no split. A required split would
force a fabricated `0` or an estimate laundered into a `measured` record — the exact §5.3c class the provenance
column exists to prevent. `v4/result.ts` `measuredCostOf(providerMetadata, rawUsage)` returns a `MeasuredCost`
(`{ costUsd, costDetails }`) or `null`: `is_byok: true` ⇒ `totalUsd = cost + upstreamInferenceCost`, `gatewayUsd = cost`
(the OR fee), `upstreamUsd = upstreamInferenceCost`; else `totalUsd = cost` (the passthrough, measured equal to the
upstream figure on every probe); the prompt/completions split rides when present. `ResultContext.measuredCostUsd`
becomes `measuredCost: MeasuredCost | null` — the ONE field beyond the two functions the brief fenced, because
`costOf` reads it. **Rejected:** deriving the BYOK arm from `cost < upstreamInferenceCost` — a heuristic where
the wire hands us the `is_byok` bit.

### 2.6 B6 — rate-limit headers, one parser

NEW `backends/kit/rate-limit-headers.ts`: `rateLimitFromHeaders(headers, now): RateLimitSnapshot | null` over the
two OBSERVED families — `anthropic-ratelimit-<axis>-{limit,remaining,reset}` (RFC 3339 reset) and the OpenAI-style
`x-ratelimit-{limit,remaining,reset}-<axis>` (Go-duration reset: `120ms`, `6m0s`, `1.5s`) — plus `retry-after`
(seconds or HTTP-date). The snapshot keeps the existing `RateLimitSnapshot` shape (its home `contract/events.ts` is
the sibling's A3 file): `utilization = max over axes of 1 − remaining/limit`, `rateLimitType` = that axis,
`resetsAt` = its reset, `status: "allowed"` (a 200 was served) or `"allowed_warning"` at ≥ 0.8 utilization. The
unsuffixed OR family (`x-ratelimit-limit`) is NOT parsed: unobserved on a 200 (§1) — documented, never guessed.
Both hosted wires read `response.headers` off the V4 stream result (`LanguageModelV4StreamResult.response.headers`,
`@ai-sdk/provider/dist/index.d.ts:3196-3200`) at `streamOnce` through a new `onResponse` callback and set
`ChatResult.rateLimit`; a `rate_limit` event rides only on `allowed_warning` (a canary, mirroring the agent-sdk's,
not a per-turn record) beside a `provider.rate_limit` log line. **Rejected:** widening `RateLimitSnapshot` with a
per-axis map — the right long-term shape, but its home is the sibling's file this train.

### 2.7 B7 — the provider response id on every hosted wire

`anthropic-messages/chat.ts` passes `generationId: drain.responseId ?? null` (the `msg_…` handle). The column /
`MessageView` / `TurnEconomics` / canon-write comments are re-worded from "the OpenRouter `gen-…` handle" to "the
provider's response id (OR `gen-…`, Anthropic `msg_…`), §5.3c class 4 opaque". The client's cost-readout gate is
the coupled follow-up (§4).

### 2.8 B1 — the APPLIED effort

`ChatResult.appliedEffort: EffortLevel | null` (REQUIRED, the preset 7-member tuple — the column's CHECK) is what
the WIRE carried, in our vocabulary: anthropic — `"none"` when `thinking.type === "disabled"`, else
`providerOptions.anthropic.effort`, else `null` (an effort the SDK vocabulary dropped ⇒ the model's default, unknown);
openai-compatible — the V4 `reasoning` word when spelled, else `null` (a row with `features.effort: "none"` spells
nothing ⇒ `null`, the brief's pin); openrouter — `providerOptions.openrouter.reasoning.effort` (`"none"` when off),
`null` on a budget or on the mandatory-reasoning REPLAY (the block is omitted; the endpoint reasons at its own default).
Read back from the OPTIONS the transport built (`backends/kit/applied-effort.ts` narrows the wire word onto the
tuple), never recomputed from the knobs — the two spellings cannot drift because there is one. agent-sdk —
`TurnStreamContext.appliedEffort` from `gen.options` (`"none"` when `thinking.type === "disabled"`, else
`options.effort ?? null`). Consumers: `entry/compose/chat.ts` `finalTurnChunk` reads `result.appliedEffort`
(replacing `req.intent.effort`); the requested value stays in `params` (already stored). The fault arm
(`engine.ts:1399`) keeps the REQUESTED effort in the outcome RING (nothing was applied; the ring is diagnostics,
not the record — `turn-fault-outcome.suite.int.test.ts:141` pins it) with its comment corrected. **Rejected:**
an optional field (`appliedEffort?:`) — "absent" would silently mean "requested" at the seam; a required field
makes every producer state it (`lock-the-extensible-shape`).

### 2.9 H2 — arm (a): the openai row's output cap + reasoning-model sampling

`contracts/inference/features.ts`: `OUTPUT_CAP_FIELDS = ["max_tokens", "max_completion_tokens"]`,
`EndpointFeatures.outputCapField?` (absent = the SDK's `max_tokens`); the builtin `openai` row declares
`max_completion_tokens` (OpenAI accepts it on every current chat model and rejects `max_tokens` on the reasoning
ones — §1). `openai-compat/body.ts` rule 8 renames the key the SDK spelled (skipped on the openrouter dialect, which
speaks OR's own body). `curated/openai.ts`: a `^(openai/)?(gpt-5|o[1-9])` row with `sampling: {}` (cite
`req_4609158162fd4953b00a62cf6f23d82f`) — on the direct wire the floor was already `{}` (no advertised sampling for an
`apiKey` row), so the row is the stated, cited set rather than a behaviour change; via OR the advertised set replaces
it (§2.1). The `.responses()` transport (reasoning summaries, `store: false`, encrypted-reasoning replay) is a
follow-up fork, not a correctness fix: a chat-completions tool loop on gpt-5 needs no reasoning replay.

### 2.10 B5 · B8 — two columns, one forward migration

`message_variants.reasoning_tokens INTEGER NULL` and `cost_details TEXT(json) NULL` (`$type<CostDetails>`, parsed
through `costDetailsSchema` at any read seam; no reader exists yet — the persistence pin proves the round-trip
through the schema). Migration `0002_variant-reasoning-tokens-cost-details` = two `ALTER TABLE … ADD COLUMN` (no
rebuild: nullable, no default — `not-null-default-defeats-cross-field-refine`). Threading: `ChatResult.usage` →
`TurnEconomics.{reasoningTokens, costDetails}` → `finalTurnChunk` → `engine.ts variantPayloadOf` → canon-write
`CanonVariantInput` → `variantColumns`. `continueVariantStatements` re-stamps `reasoningEffort`, `reasoningTokens`,
`costDetails` beside the economics it already re-stamps (a continued variant's `tokensOut`/`costUsd` are the
continuation's; a stale `costDetails` beside a fresh `costUsd` would contradict itself). `maxOutputTokens` and the
`reasoning_duration` sidecar stay insert-only as today (named, not fixed — out of these rows). Gate population:
`cost_details` enters `json-column-write-parity` with ONE update writer (whole-replace of caller input) — no
straddle; the gate's own limits (`json-column-write-parity.ts` header) say a lone writer is never judged.

### 2.11 A5 — the refusal event on the direct wire

NEW `backends/anthropic-messages/refusal.ts`: `refusalEventOf(drain, model, at)` → the existing `refusal` member when
`drain.finish.unified === "content-filter"` (branch on the finish reason, never on `stop_details` presence — the
vendored doc's own rule), `category`/`explanation` from `providerMetadata.anthropic.stopDetails` (null when absent),
`retried` = `iterations.some(type === "fallback_message")`, `fallbackModel` = that iteration's `model`. Emitted into
`turn.events` and `req.onEvent`. `iterations` already rides RAW on `ChatResult.providerMetadata.anthropic`; a TYPED
`servedByFallback` on the variant sidecar's anthropic arm is NOT added — no producer folds `ChatResult.providerMetadata`
into `variantMetadataSchema.providerMetadata` on the tree (grep: zero server readers), and a schema field with no
writer is the open-bag class in reverse. Named in §4.

## 3. Coupled-site inventory (enumerated before building)

| Change | Sites |
| - | - |
| new `message_variants` columns | `db/schema/chat.ts` · migration `0002` + `meta/0002_snapshot.json` + `_journal.json` · `chat/verbs/fork.ts` `Required<$inferInsert>` (2 rows, `copied`) · `tests/server/domain/chat/verbs/fork.int.test.ts` `FORK_COLUMN_CLASS` (2 rows) · `canon-write.ts` (input + columns + continue) · `contract/results.ts` `TurnEconomics` · `entry/compose/chat.ts` `finalTurnChunk` · `engine.ts variantPayloadOf` · `tests/db/schema/chat.int.test.ts` · `tests/server/domain/chat/persistence/canon-write.int.test.ts` |
| `ChatResult.appliedEffort` (required) | `contract/chat.ts` · both V4 wires' call sites · `agent-sdk/types.ts` + `runner.ts` (+ `agent-runner.ts` null) · `tests/server/domain/chat/engine/engine.int.test.ts:1994` · `tests/server/entry/compose/chat.test.ts:431` · `entry/compose/chat.ts:788` |
| `measuredCostOf` shape | `v4/result.ts` (`ResultContext.measuredCost`) · both wires' ctx blocks · NEW `tests/inference/backends/v4/result.test.ts` |
| `sampling` replace | `capability/synthesize.ts` · `tests/inference/capability/synthesize.test.ts` · `curated/anthropic.ts` row order |
| measured loader | NEW `capability/sources/rows.ts` · `curated/loader.ts` · NEW `measured/loader.ts` · `measured/anthropic.ts` (authoring form) · NEW `measured/openrouter.ts` · `resolve/resolve-task.ts:34,185` |
| H2 | `contracts/inference/features.ts` · `builtin-providers.ts` (openai row) · `openai-compat/body.ts` · `curated/openai.ts` · `tests/inference/backends/openai-compat/body.test.ts` · `tests/contracts/inference/providers.contract.test.ts` |
| docs | this file (no catalog receipt — owed at the barrier) · `orbweaver-inference-package.md` §15c-18 (one BUILD LOG bullet) |

## 4. Forks, deferrals, follow-ups (each with its receipt)

- **B7 × the client cost readout** — `message-metadata-row.tsx:151` / `message-cost-readout.tsx:42-47` gate the
  reveal on `generationId !== null`; with Anthropic's `msg_…` stored, a revealed anthropic swipe calls
  `connection.generationCost` and gets `requireOpenRouter`'s typed refusal. Default taken: B7 lands (the audit's
  ruling; the id is the support handle), the client gate is a named follow-up: `builtinProvider(message.provider)?.dialect === "openrouter"`
  (or a `ProviderDef` diagnostics flag) at both sites. Client is outside this lane's fence and tier.
- **The refusal / rate_limit events die at `entry/compose/chat.ts` `warningChunks`** (it forwards `warning` only) —
  true for the agent-sdk's refusal today as well. The inference side now emits them on every wire; the product
  read is a compose/engine follow-up (a `refusal` chunk kind on `TurnStreamChunk`).
- **The raw → closed-union sidecar fold** (`ChatResult.providerMetadata` → `variantMetadataSchema.providerMetadata`)
  has NO producer on the tree; A5's "mark iterations-fallback on the turn's providerMetadata" is satisfied on the
  TURN (`retried` on the event, `iterations` raw on `ChatResult.providerMetadata.anthropic`), not on the ROW.
- **A1's STORAGE landed here; its READ path is `carryReasoning`'s** (owner scope ruling 2026-09-20, §8.8 of the
  plan doc). Arm taken: a `message_variants.reasoning_parts` typed-JSON column (`$type` = the `reasoning` members
  of `ChatContentPart`, NULL when nothing replayable) — NOT the `metadata` sidecar, because the parts are replay
  MATERIAL the assembly reads back onto the assistant row, not provider-opaque provenance about a turn. Threaded
  `ChatResult.reasoningParts` → `TurnEconomics.reasoningParts` → compose → engine → canon-write (insert; a continue
  REPLACES them with the continuation's — only the last generation's signed blocks are replayable, while the
  rendered `reasoning` text is combined). Fork class: `member-projected` (the same P3 deception cut as
  `reasoning`). Not built here, by the ruling: the `carryReasoning` knob, the funnel resolution, the converter
  carry, and `wire-history.ts`'s re-materialization of the parts ahead of the tool-call part.
- **H2 arm (b)** — a dedicated `@ai-sdk/openai` `.responses()` transport for the `openai` row (reasoning summaries,
  `store: false`, `include: reasoning.encrypted_content` replay, `max_completion_tokens` natively). A new dependency +
  transport; Needs-owner on the dependency, not on correctness.
- **`maxOutputTokens` and the `reasoning_duration` sidecar are insert-only across a continue** (pre-existing; the
  continue re-stamps tokens/cost). Named, not changed.
- **The doc catalog receipt for this file** — the one-commit lane law and the two-commit receipt stack cannot both
  hold; the receipt pass is the orchestrator's at the barrier (`new-doc-catalog-two-commit-stack`).

## 5. Test plan (red-first where a defect is fixed; planted controls where a fence could be green-that-cannot-fail)

| Pin | File | Proves |
| - | - | - |
| `measuredCostOf`: non-BYOK total = cost, split from `usage.raw`; BYOK fixture → gateway/upstream/total; no OR metadata → null; `costOf` measured/estimated/unrecorded arms | NEW `tests/inference/backends/v4/result.test.ts` | A4 (red on the old source: a number, not a record) |
| header families → snapshot; none → null; axis selection; `allowed_warning` at 0.8; duration + RFC 3339 + retry-after parsing | NEW `tests/inference/backends/kit/rate-limit-headers.test.ts` | B6 |
| finish `content-filter` + stopDetails → refusal; fallback iteration → retried/fallbackModel; `stop` → null | NEW `tests/inference/backends/anthropic-messages/refusal.test.ts` | A5 |
| the wire word narrows onto the preset tuple; garbage → null | NEW `tests/inference/backends/kit/applied-effort.test.ts` | B1 |
| a whole openai-compatible turn over a fake SSE fetch: `features.effort: "none"` ⇒ `appliedEffort === null`; `reasoning_effort` row ⇒ the word; headers ⇒ `rateLimit`; the anthropic wire ⇒ `generationId = msg_…`, `appliedEffort = "none"` on disabled | NEW `tests/inference/backends/openai-compat/chat.test.ts`, `tests/inference/backends/anthropic-messages/chat.test.ts` | B1 · B6 · B7 end-to-end at the wire |
| `sampling` replaces (measured `{}` over advertised `{temperature}` ⇒ `{}`) | `tests/inference/capability/synthesize.test.ts` | §2.1 (red-first) |
| measured loader: `match` by provider/model; opus-5 + opus-4.8 via OR ⇒ empty sampling after the advertised set; `gpt-5.4` via OR drops temperature with `sampling_knob_dropped`; opus-5 via OR resolves NO verbosity; gpt-5 keeps curated verbosity | NEW `tests/inference/capability/sources/measured/loader.test.ts` | B3 · H1 · H3 |
| `verbosity` is not derived from `supported_parameters` | NEW `tests/inference/capability/sources/advertised/openrouter.test.ts` | H1(a) (red-first) |
| curated anthropic table: opus-5 row adaptive; `sampling: {}` on the SDK-table ids on both wires; fable + effort `none` ⇒ `enabled: true` + `reasoning_mandatory_clamp`; no fable/opus-5/sonnet-5 id resolves `forced-tool` | NEW `tests/inference/capability/sources/curated/anthropic.test.ts` | A6 · A8 · B3 |
| rule 8 renames `max_tokens` on `max_completion_tokens` rows; untouched on openrouter / absent | `tests/inference/backends/openai-compat/body.test.ts` | H2 (red-first) |
| the openai row declares `outputCapField: max_completion_tokens`; `costDetailsSchema` accepts the optional split and refuses a non-number | `tests/contracts/inference/providers.contract.test.ts`, NEW `tests/contracts/inference/usage.contract.test.ts` | H2 · A4 |
| insert stamps `reasoningTokens` + `costDetails` (positive); absent ⇒ NULL (negative); continue re-stamps the three; a hand-written malformed `cost_details` degrades to null through `costDetailsSchema.safeParse` | `tests/server/domain/chat/persistence/canon-write.int.test.ts` | B5 · B8 · B1 |
| the two columns round-trip and default NULL; the census still equals the live table | `tests/db/schema/chat.int.test.ts`, `tests/server/domain/chat/verbs/fork.int.test.ts` | schema · fork ratchet |
| the bridge writes `economics.reasoningEffort` from `appliedEffort`, not `intent.effort` | `tests/server/entry/compose/chat.test.ts` | B1 seam (red-first) |
