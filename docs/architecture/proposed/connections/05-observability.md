---
kind: spec
status: draft
updated: 2026-07-10
---

# 05 — observability & debug (owner-demanded): the per-turn structured-event layer

The signal that surfaces cache rot (a broken breakpoint silently re-bills \~12.7k tokens/turn — nothing
fails) and makes one turn reconstructable end-to-end. **This is NOT a new framework** — it EXTENDS the
existing `provider.*` structured-log taxonomy (`backends/agent-sdk/log.ts`) and reuses the existing
`sampling_knob_dropped`-style warning emit sites (`resolve-chat.ts:50-51`). Grounded entirely in the
real logger (`#foundation/observability` · pino multistream · the pino ring + `/api/_debug/logs`).

## 0. What already exists (the anchor — REUSE, don't rebuild)

`backends/agent-sdk/log.ts` is a `provider.*` taxonomy: a thin `providerLog(level, event, fields)` sink
(`log.ts:35`) that emits ONE pino line tagged `provider:true` + `backend:"agent-sdk"` + an `event`
string, picked up for free by the pino ring + `/api/_debug/logs`. Its header already states the seam:
"the shape GENERALIZES to other backends later ... WITHOUT building that generalization now — this file
is agent-sdk-family-local until a second backend needs it." anth-direct (part 02) IS that second
backend, so this design realizes that promotion. The existing events stay verbatim; new ones join the
same taxonomy:

| existing event | level | carries (today) |
| - | - | - |
| `provider.turn` | info | chat/session/model, disposition, `terminalReason`, timings, `ProviderTurnUsage` (`log.ts:45-53` — `tokensIn/Out`, `cacheReadTokens`, `cacheWriteTokens`, `costUsd`), `contextUsage` |
| `provider.session` | debug | heal disposition (non-plain-resume only — hot path silent, `log.ts:85-90`) |
| `provider.error` | error | classified `ProviderError.toLog()` provenance (+ bounded `stderrTail`) |
| `provider.rate_limit` / `.retry` / `.drift` / `.refusal` / `.leak` / `.compaction` | warn/debug | per-event fields |

The gaps this part closes: OpenRouter emits ZERO `provider.*` lines (usage extracted, never logged);
there is no `provider.cache` receipt, no `provider.channel` decision line, no `provider.capability`
resolution line; and the funnel's drop-warnings ride only the turn's `ChatEvent[]`, never a log line.

**Log-line-only by design (spans are OUT of scope).** This layer emits pino lines, not OpenTelemetry
spans. The trace ring already defines `providerDurationMs` (`foundation/observability/tracing.ts:62-63`)
as the sum of `provider.*` SPAN durations — but NO runner emits a provider span, so that field is inert
(permanently 0) TODAY: a PRE-EXISTING dead field, not a regression this layer introduces. Log-only is the
deliberate choice (it matches the anti-framework bar + the redaction doctrine). A builder must NOT add
provider spans to populate `providerDurationMs` — that forks observability into two half-systems.
Per-turn timing already rides `provider.turn`'s `timings` FIELD, not a span.

## 1. The decoupling rule (load-bearing — the owner constraint)

ONE emitter per event; **no `if (model === …)` / `if (wire === …)` branching at any emit site.** The
event carries the RESOLVED facts as fields — the resolver already decided them (part 01 §3). An emit
site reads `capability.turns.*` / `ResolvedChatKnobs.*` and writes the field; it never re-derives.
Concretely: the cache receipt reads `usage.cacheReadTokens` + the placer's returned offset decision, the
channel line reads `ResolvedChatKnobs.dynamicContextChannel` — neither inspects a model id. This keeps
the README anti-ST bar: model knowledge stays in the resolver; observability is a pure downstream reader.

## 2. Promote `provider.*` to a shared kit sink

W-slot: part 04 **W3** — rides the cache-placer kit-hoist in the SAME wave (matches W3's done-criteria,
no separate prep wave). Move `providerLog` +
`PROVIDER_LOG_LEVELS` + the shared event/usage interfaces from `backends/agent-sdk/log.ts` to
`backends/kit/provider-log.ts`; `backend` becomes a per-call argument (agent-sdk passes `"agent-sdk"`,
anth-direct `"anth-direct"`, OR `"openrouter"`). Every existing agent-sdk call re-imports it unchanged
(behavior-neutral hoist — the log.ts header ALREADY anticipates this). No new dependency, no new logger.

## 3. The event taxonomy (per chat turn)

All events ride the existing `provider.*` shape (`provider:true` + `backend` + `event`), so they filter
together (`provider:true`), per-backend, and per-event. Fields are metadata ONLY (§5 redaction).

### 3a. `provider.cache` (info) — THE cache receipt (surfaces the 12.7k rot)

The prominent signal. One line per turn on any `explicitPromptCache` wire:

| field | source | why |
| - | - | - |
| `cacheReadTokens` | `usage.cacheReadTokens` (`log.ts:49`) | tokens served from cache |
| `cacheWriteTokens` | `usage.cacheWriteTokens` | tokens billed to WRITE cache this turn |
| `breakpointsPlaced` | the kit placer's returned count (part 02 §5d) | 3 (system + R1 pair) when healthy |
| `breakpointOffsets` | the placer's `depth`/`depth+2` offsets-from-end | the PAIR positions, for drift diagnosis |
| `hitRatio` | `cacheReadTokens / (cacheReadTokens + cacheWriteTokens)` (0 when both 0) | the rot canary: a breakpoint regression collapses this toward 0 while `cacheWriteTokens` spikes |
| `minCacheTokens` | resolved `turns.cacheMinTokens` (part 01 §4b) | proves the per-model floor that gated placement |

A collapsed `hitRatio` with a spiked `cacheWriteTokens` IS the 12.7k re-bill, visible in one grep
(`provider:true event:provider.cache`). This line makes the ADD-1 acceptance gate (part 04) operable —
the live probe reads the same fields off the same turn.

### 3b. `provider.channel` (debug) — the volatile-content channel decision

`{ channel: ResolvedChatKnobs.dynamicContextChannel, midConvCapable: turns.midConversationSystem,
demoted: boolean }`. `channel ∈ "system-block" | "message-tail"` (part 01 §5 dynamic-context row);
`demoted:true` mirrors the `dynamic_context_demoted` funnel warning (a `message-tail` request on a
`midConversationSystem:false` model). Answers "which channel, and why" without a model-id branch — the
gating flag value IS the why.

### 3c. `provider.capability` (debug) — the resolution line

`{ wireShape, requestedModel, servedModel?, turns: {...resolved flags}, droppedWarnings: [{code,
message}] }`. `wireShape` is the `deriveWireShape(api, source)` output (part 01 §3); `turns` is the
resolved `(model × wire-shape)` cell. `droppedWarnings` folds EVERY funnel drop (`sampling_knob_dropped`,
`effort_dropped`, `display_dropped`, `adaptive_budget_dropped`, `verbosity_dropped`,
`dynamic_context_demoted`) — the same `ResolvedWarning[]` already surfaced as `ChatEvent`s, now ALSO on a
log line so a drop is greppable after the fact, not only visible in the turn payload.

### 3d. `provider.sampling` (debug) — which knobs survived

`{ requested: {temperature?, topP?, topK?, minP?, ...}, applied: {...}, dropped: [{knob, reason}] }`.
`applied` = the `ResolvedSampling` fields that reached the wire; `dropped` = the funnel's
`sampling_knob_dropped` set with the descriptor-range reason. On the `anthropic-direct` transport this is
where a post-Opus-4.6 `{}` sampling resolution shows as "all knobs dropped, model-deprecated" (part 03
§3) — no 400, and the reason is on record.

### 3e. wire/transport on `provider.turn` (extend the existing line)

Add `{ backend, transport: "cli" | "direct", credentialSource }` to the existing `provider.turn` fields.
`credentialSource` is the SOURCE vocab (`max-pro-sub` / `openrouter` / `anthropic` / `vllm` / …) — the
sub-vs-key canary the agent-sdk line ALREADY carries as `apiKeySource` (`log.ts:63`). **NEVER the
secret** (§5). `transport` is the part 01 §4c axis (`cli` vs `direct`).

### 3f. heal / terminal — already covered

`provider.session` (heal disposition) + `provider.turn.terminalReason` (the classified `TerminalReason`,
`verify.ts` `classifyTerminalReason`) exist verbatim; no change. anth-direct is stateless (no heal) — it
emits `terminalReason` from `stop_reason` mapping (part 02 §5e) on its own `provider.turn`.

## 4. The debug affordance — one turn, end-to-end (the correlation id)

A single turn must be reconstructable: intent in → resolved knobs → channel → wire metadata (redacted) →
usage/cache out. **Reuse the existing correlation id — do NOT mint a new one.** Every `provider.*` line
already rides the request-scoped child logger (`getLog()` returns a child bound to `requestId`/`userId`
inside `runInRequest`, `logger.ts:175-176`; the agent-sdk log header states this). So all events for one
turn already share the `requestId` — `/api/_debug/logs?requestId=<id>` (`debug/routes.ts:208`)
reconstructs the full story TODAY for anything that logs.

The one gap: a single request can carry MULTIPLE provider turns (a retry, a multi-turn agent loop). Add a
`turnId` (a cheap per-turn ULID/counter minted where the funnel result is assembled) threaded funnel →
runner → the `provider.*` fields, so `provider:true turnId:<id>` isolates ONE turn's `capability` →
`channel` → `sampling` → `cache` → `turn` chain within a busy request. `turnId` rides the same
`ResolvedChatKnobs` carriage the knobs already use — no new plumbing seam.

## 5. Redaction & levels (mandatory, load-bearing)

**Redaction** — this layer adds NO new mechanism; it plugs into the EXISTING three-layer redaction belt:
(1) the pino `redact` config (`logger.ts:132-149`, censor `[redacted]`) scrubs key names
`authorization`/`token`/`apiKey`/`password`/`ciphertext`/`cookie` + one-level `*.token` in every log
object; (2) `redactSensitivePath` (`observability/middleware.ts:28`) rewrites the `/join/<token>` invite
BEARER to `/join/:token` before ANY sink (pino line, request ring, trace root) — the standing precedent
that a bearer credential must never persist raw, and the anth-direct OR-key is the SAME shape of concern;
(3) `redactHeaders` (`kit/openai-compat/body.ts:141`) scrubs provider request headers. The one key name
this design ADDS that layer (1) MISSES is the `@anthropic-ai/sdk` constructor's `authToken` (`token` ≠
`authToken`, and `*.token` will not match it) — W8 extends `redact.paths` with `authToken` +
`*.authToken`. The anth-direct outbound credential rides ONLY the Bearer header (part 02 §6.4) and is
scrubbed via the EXISTING `redactHeaders` path (layer 3) should any diagnostic ever inspect headers —
never a bespoke scrubber. Defense-in-depth behind the metadata-only emit doctrine, which already keeps
the key off the line.
The belt for THIS layer, enforced at the emit site (defense-in-depth, the `log.ts` doctrine #12 that logs
are METADATA):

| rule | verdict |
| - | - |
| OAuth token / api key / Bearer | NEVER on any line at any level — only the `credentialSource` VOCAB (§3e), never the material. The `@anthropic-ai/sdk` key lives only in the outbound header (part 02 §6.4). |
| full prompt / character / RP / system-prompt content | NEVER above `debug`; and even at `debug` these events carry NONE of it — every field in §3 is a count/id/flag/classification. The one existing content-adjacent string (`stderrTail`) is CLI runtime diagnostics, bounded, never model text (`log.ts` doctrine #12). |
| resolved knob VALUES (temperature, minP, verbosity, channel) | ALLOWED — user-authored generation settings, not secrets or RP content. |
| error bodies | via the sanitize kit path (part 02 §5e) — never raw into a log line. |

**Levels + the toggle.** The `provider.*` levels are the existing `PROVIDER_LOG_LEVELS`
(`["debug","info","warn","error"]`, `log.ts:31`). Verbosity is governed by the EXISTING pino `logLevel`
— and per the owner rule (AppSettings-over-ENV, MEMORY) the live toggle is the EXISTING
`appSettings.logLevel` field (`contracts/src/settings/index.ts:202`, `logLevelSchema` = the standard pino
`LOG_LEVELS` tuple, `:41-43`); the settings resolver already rebinds `logger.level` on reload. NO new
setting: `provider.cache`/`.turn` ride `info` (visible by default), `.channel`/`.capability`/`.sampling`
ride `debug` (opt-in by dropping `logLevel` to `debug`). `LOG_LEVEL` env stays the pre-boot/first-setup
seed only.

## 6. Wave threading (the instrumentation ships WITH the feature)

Each cache/channel/capability/sampling-touching wave's done-criteria gains "emits its `provider.*`
event." The full mapping lives in part 04 §1 (per-wave done-criteria) and part 04 §Observability gate;
the rule: NO wave that resolves or applies one of these facts is done until its event is on the wire.
Concretely — W2 emits `provider.sampling`; W3 emits `provider.cache` (+ the shared-kit hoist §2); W4
emits `provider.channel`; W1's resolver work is observable via `provider.capability` once a consumer
runs (W3+). This is a done-criterion, not a follow-up: an un-instrumented cache wave cannot prove it
satisfies the ADD-1 cache gate, because the gate reads these fields.
