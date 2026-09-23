---
kind: spec
status: draft
updated: 2026-07-10
---

# 02 — anth-direct (D67): the direct Anthropic-Messages backend (paid-key-only, tool-less)

A NEW sealed chat backend in `infra/providers/backends/` that speaks the Anthropic Messages API
DIRECTLY (official `@anthropic-ai/sdk`, §4) — we build the messages array and place `cache_control`
ourselves. **v1 PRIMARY path = the existing `openrouter` credential source** (SDK
`baseURL:"openrouter.ai/api"` + `authToken` Bearer; ZERO new credential); a first-party Anthropic key
is an OPTIONAL additive second source (§3). STRICTLY ADDITIVE: coexists with the agent-sdk backend;
nothing is deprecated. PAID-KEY-ONLY: the free Max sub can NEVER route here (§3d — the load-bearing
invariant). Consumes the part 01 capability model unchanged — it is the `direct` transport apply-site.

## 0. What the direct transport unlocks (the CLI-denied wins, with receipts)

The agent-sdk backend reaches Claude through the bundled Claude Code CLI subprocess — the CLI owns the
wire body. Four controls are structurally unreachable there and become ours on a raw request:

| win | CLI (agent-sdk) status | anth-direct | receipt |
| - | - | - | - |
| EXPLICIT `cache_control` breakpoint placement (up to 4 per request) | CLI-owned; placement is server-gated (the `hB` feature flag — proven 2026-07-10) | we place `cache_control` on ANY content block — the R1 PAIR (§5d) | Tier-3b Esoteric §5; the per-model min-cache floors (§5d) per Anthropic prompt-caching docs (pinned 2026-07-10) |
| CLEAN model context — zero CLI scaffolding | the CLI injects `<system-reminder>`, `<budget:token_budget>`, `# userEmail` into context | the request body is exactly the array we build | `scripts/probes/sdk-hook-wire-probe.ts` (mode-1 capture) |
| mid-conv-system + prefill + thinking placement, no subprocess | mid-conv-system only via the hook; prefill NEVER emitted; every turn pays a subprocess spawn | we place each concern where we want; plain HTTP | part 01 §1a/§2; `env.ts` spawn machinery |
| Claude SAMPLING (temperature/top\_p/top\_k/stop\_sequences) | the agent-sdk options carry NO sampling field; curated Claude `sampling: {}` (`chat-models.ts:38-41`) | the Messages wire has them — PER-MODEL (part 03 §3) | `messages.d.ts:2096-2100,2116-2121,2218-2227` |

## 1. The transport axis (recap)

anth-direct shares the anthropic-messages WIRE with the agent-sdk backend, differing in TRANSPORT —
`cli` vs `direct`. The full split table is part 01 §4c; the resolver produces the right transport cell
via `deriveWireShape("anthropic-messages", *) → anthropic-direct` (part 01 §3). anth-direct is "a thin
mechanical apply realizes it" made literal — no new derivation home.

## 2. Contract placement — the new arms

All infra-internal; a domain never sees the backend key (Tier-3b invariant 1/3).

| axis | home | change |
| - | - | - |
| `BackendKey` | `infra/providers/contract/backend.ts:52-58` `BACKEND_KEYS` | + `"anth-direct"` (sealed; never leaves the tier) |
| `ChatApi` (protocol axis, user vocab) | `contracts/src/connection/index.ts:34-36` `CHAT_APIS` | + `"anthropic-messages"` — a genuinely distinct wire protocol, exactly what the axis encodes (`agent-sdk \| chat-completions \| responses` today) |
| `ChatRequest` arm | `infra/providers/contract/chat.ts:132-172` | new discriminated arm (below) |
| `deriveRunner(api, source)` | `roles/dispatch.ts:29-98` | new `"anthropic-messages"` outer arm (§3a routing table); `assertNever` forces every source to be handled |
| firewall policy | `roles/firewall.ts:28-` `ROLE_SOURCE_POLICY` | `chat` row already permits `openrouter` (v1 needs NO row change); gains `"anthropic"` only with the optional first-party source (§3c) |

The new request arm (mirrors the `chat-completions` arm — SHAPE output is reused byte-identically):

```ts
| {
    readonly api: "anthropic-messages";
    readonly history: readonly ChatHistoryMessage[];
    /** SHAPE-computed rolling breakpoint offset-from-end — same field/semantics as the
     *  chat-completions arm (R1: computed in SHAPE, placed by the runner as the PAIR — §5d). */
    readonly historyCacheBreakpointFromEnd?: number | undefined;
  }
```

Deliberately NOT on the arm (per the agent-sdk-arm precedent, `chat.ts:173-175` "the field lands on
that arm WITH its first consumer"): `tools`/`toolChoice` (anth-direct is TOOL-LESS by charter),
`responseFormat` (no committed consumer; Anthropic structured output is tool-forcing — rides the
non-goal), `providerRouting`/`customParameters` (OR-skin `/v1/messages` provider prefs are unverified —
add with evidence; also the security belt: a preset cannot inject wire fields — the body is 100%
runner-owned). `systemPrompt` `{static, dynamic}` rides `ChatRequestCommon` (`chat.ts:114`) unchanged.

## 3. Credentials & routing — PRIMARY = the existing `openrouter` source; THE SUB-EXCLUSION

### 3a. The source×api→runner routing

| api \ source | `max-pro-sub` | `openrouter` (PRIMARY) | `anthropic` (OPTIONAL/future) | `vllm` | `local-light` | `custom_openai` |
| - | - | - | - | - | - | - |
| `agent-sdk` | agent-sdk | agent-sdk (mode-2) | invalid | agent-sdk (mode-3) | invalid | invalid |
| `chat-completions` | invalid | openrouter | invalid | vllm | invalid | custom-openai |
| `responses` | invalid | openrouter | invalid | invalid | invalid | invalid |
| **`anthropic-messages`** (NEW) | **invalid — THE INVARIANT (§3d)** | **anth-direct** — SDK `baseURL:"https://openrouter.ai/api"` + `authToken:<OR key>` (Bearer, §4) | anth-direct — SDK default `api.anthropic.com` + `apiKey` (x-api-key) | invalid | invalid | invalid |

**v1 needs ZERO new credential.** The primary path RIDES the existing `openrouter` credential source.
`deriveRunner("anthropic-messages","openrouter")` → `"anth-direct"`; the runner reads the existing
`OpenRouterCredential` (`credentials/index.ts:145-150`); diagnostics reuse the openrouter-backend probe
(source-dispatched, `diagnostics.ts`); `assertCoherent` gains `("anthropic-messages","openrouter")`.
Model ids are OR slugs. Selection: `roleDefaults.chat` already carries `{api, source, model}`
(`verbs/resolve-role.ts:62-68`).

### 3b. Coexistence with agent-sdk — who routes where (NOTHING is deprecated)

agent-sdk mode-2 (the CLI on an OR key) is LOAD-BEARING and stays: it is the ONLY paid path for
tool-using multi-turn agents (buddy, RPG autonomous agents, chat-crew — D58/D59/D60 need the
tool-server + agent loop + session/seed machinery) + session-resume prompt-cache economics (Tier-3b
Esoteric §3/§5). anth-direct serves PURE tool-less chat turns: explicit 4-breakpoint `cache_control` ·
zero CLI scaffolding · prefill + sampling on capable models · hand-placed mid-conv-system · no
subprocess spawn.

Routing rules (structural, not prose):

- The `agent` ROLE can never reach anth-direct: **the role selector hard-pins `api:"agent-sdk"` for the
  agent role** (`verbs/resolve-role.ts:69-74` — `agent: (rd, ov) => ({ api: "agent-sdk", … })`) and
  `deriveRunner` has no `("agent-sdk","…") → anth-direct` arm. (NOTE: this is the real structural guard —
  the firewall `agent` row does NOT exclude `openrouter`; `ROLE_SOURCE_POLICY.agent` is
  `["max-pro-sub","openrouter","vllm"]`, `firewall.ts:33`. The api-pin + `deriveRunner` are what keep
  the agent role off anth-direct, not the firewall source list.)
- A CHAT turn picks per `roleDefaults.chat` / per-agent override — both Claude paths stay side by side.
- The owner-conditional unconfigured default (`verbs/resolve-role.ts:62-68`) is UNCHANGED — anth-direct
  is opt-in configuration, never a silent default.

### 3c. OPTIONAL future — promoting `anthropic` to a first-party dispatch source (additive)

Not required for v1; recorded so the landing is one clean change. `CRED_PROVIDERS` already holds
`anthropic` as a forward-compat storage slot ("NO resolver arm yet — storable, never dispatched",
`contracts/src/credentials/index.ts:53-65`); the header's own rule + ledger §2 Identity say it lands as
"union member + resolver arm + provider strategy together." When built: `CRED_SOURCES` + `"anthropic"`
(every `assertNever` red-flags the missed arms, Tier-3b §7.5); a new branded `AnthropicCredential` arm
(`source:"anthropic"; apiKey; credentialId`), mintable only via the domain factories; metadata = the
`null` arm (fixed base URL, the schema comment `:74-75` already names anthropic); AAD `${userId}|anthropic`,
storage tuple already byte-stable — no migration (`credentials/index.ts:17-21`);
`backendForSource("anthropic")` → `"anth-direct"`; firewall `chat` row gains `"anthropic"`; probe via
`GET /v1/models`; model ids = dated Anthropic ids (the `getChatModel` 3-stage prefix match handles both
spellings, Esoteric §6). The `agent` firewall row NEVER gains either anth-direct source. `summarize`
via anth-direct is a cheap later arm (Tier-3b §9), not v1.

### 3d. THE SUB-EXCLUSION INVARIANT (load-bearing, non-negotiable)

**The free Max sub (`max-pro-sub`, host `claude login` OAuth) can NEVER drive anth-direct.** Sending
the sub's OAuth token to a paid HTTP endpoint is exactly the st-claude-proxy ban shape the agent-sdk
firewall exists to prevent (`backends/agent-sdk/env.ts:19-22`: "the st-claude-proxy ban shape (token →
our HTTP client → a paid endpoint) is exactly what we do not do"). The sub stays on the agent-sdk CLI
(mode-1, filesystem aliasing only); anth-direct is PAID-KEY-ONLY. Enforcement, pushed up the ladder
(constitution §2.2):

1. **Compile-time:** the runner's arm type takes `OpenRouterCredential` (v1; `| AnthropicCredential`
   when §3c lands) only — a `MaxProSubCredential` does not typecheck into the backend. The sub
   credential also carries NO key material (`credentials/index.ts:139-143` — "No row, no key"), so the
   resolved-credential OBJECT is structurally empty. **But this only covers the object; the SDK has an
   ambient credential surface (§4, the security belt) that the runner must ALSO neutralize** — the
   type-level emptiness is necessary, not sufficient.
2. **Dispatch:** `deriveRunner("anthropic-messages", "max-pro-sub")` → typed `ProviderError`
   `kind:"invalid"`, fail-closed (the `dispatch.ts:70-75` max-pro-sub-outside-agent-sdk pattern).
3. **Test-time:** a named firewall test asserts the pairing throws (the Tier-3b invariant-5 sibling).

## 4. HTTP client — the official `@anthropic-ai/sdk` on the egress-firewalled global fetch (decided)

| option | verdict | why |
| - | - | - |
| **official `@anthropic-ai/sdk` (0.106.0)** | **CHOSEN** | ALREADY RESOLVED in the tree — a transitive dep of `@anthropic-ai/claude-agent-sdk` (`node_modules/.pnpm/@anthropic-ai+sdk@0.106.0_zod@4.4.3`); promoting it to a DIRECT `packages/server` dep names an existing surface, installs nothing. The FULL Messages client: `messages.create()` (streaming + non-streaming) + `messages.stream()` (`resources/messages/messages.d.ts:31-33,74`), typed `RawMessageStreamEvent` union (`:944`), `cache_control` throughout, `thinking`/adaptive/`redacted_thinking`/prefill types + the per-model sampling deprecations (part 03 §3) documented IN the types. It owns the fast-moving Anthropic drift we would otherwise eat. Same posture as the repo's existing `@openrouter/sdk` vendor client (`backends/openrouter/client.ts` — a vendor SDK behind a narrow structural port, riding our dispatcher — the directly analogous law). |
| `@openrouter/sdk` Claude\* types/helpers | NO | ships `ClaudeMessageParam` with per-block `cache_control` but has NO `/v1/messages` operation, and its `fromClaudeMessages` converter EXPLICITLY DROPS `cache_control` (`esm/lib/anthropic-compat.d.ts`). Cannot carry this wire. |
| raw `fetch` + own lenient zod | NO | the §7.3 zod-at-the-wire pattern is a FALLBACK for surfaces with no vendor SDK, not a mandate. We'd own the Messages wire schema + eat Anthropic drift, for no gain (egress-control is a wash — below). |

**Egress-dispatcher finding (verified):** the SDK uses the GLOBAL `fetch` when no custom `fetch` is
injected (`client.d.ts:99-103`). Node's global `fetch` is undici, driven by `setGlobalDispatcher`
(`infra/network/egress.ts:72-140`), so the SSRF egress firewall applies AUTOMATICALLY — identically to
`@openrouter/sdk`. NEVER inject a private undici `Agent`/custom fetch (bypasses the global dispatcher +
firewall). Both hostnames (`openrouter.ai`, `api.anthropic.com`) are public — no `EGRESS_ALLOWLIST`
change.

**The narrow port + auth wiring (mirrors `OrClient`, `backends/openrouter/client.ts:46-91`).**
`backends/anth-direct/client.ts` exports a structural `AnthClient` slice (just `messages.create`) so a
test injects a plain fake. Construction is per-key, LRU-cached like the OR client:

- **OR-key path (PRIMARY, the only v1-required path).** `new Anthropic({ baseURL:
  "https://openrouter.ai/api", authToken: <OR key>, … })`. **GOTCHA (document + test):** use `authToken`
  (sends `Authorization: Bearer`, `client.d.ts:39-40`), NOT `apiKey` (sends Anthropic's `x-api-key` —
  OR wants Bearer). The SAME env pair mode-2 already uses (`env.ts` `buildClaudeOpenRouterEnv`).
  EMPIRICALLY confirmed 2026-07-10: a Bearer-OR-key call to `openrouter.ai/api/v1/messages` returned
  200 + honored mid-conv-system + cache\_control.
- **First-party path (OPTIONAL, additive).** `new Anthropic({ apiKey: <anthropic key>, … })` — the
  SDK's default `https://api.anthropic.com` + `x-api-key` + `anthropic-version` handled internally.

### The extended security belt (load-bearing — flag to the security-executor build)

The `@anthropic-ai/sdk` client auto-resolves credentials from a WIDER surface than three env vars — and
its docs say so explicitly: with none of `apiKey`/`authToken`/`credentials` set, "the client
automatically resolves credentials from config files or environment variables on the first request"
(`client.d.ts:47-52`). The full ambient surface (`client.d.ts:28-83`):

| SDK constructor field | ambient behavior if not pinned | belt requirement |
| - | - | - |
| `apiKey` | defaults to `process.env.ANTHROPIC_API_KEY` (or an `ApiKeySetter` async fn) | pass EXPLICITLY (OR-key path passes `authToken`, so pass `apiKey: null` to kill the env default) |
| `authToken` | defaults to `process.env.ANTHROPIC_AUTH_TOKEN` | pass EXPLICITLY (the resolved OR key) |
| `baseURL` | defaults to `process.env.ANTHROPIC_BASE_URL` | pass EXPLICITLY (`openrouter.ai/api` or the first-party base) |
| `credentials` (`AccessTokenProvider`) | when omitted with no key, resolves from config files on first request — an OAuth/workload-identity minting path | pass `credentials: null` — this is the surface that could lazily mint a token from the host `claude login` OAuth config on the OWNER's box |
| `config` (`AnthropicConfig`, `user_oauth.credentials_path`) | resolves creds from a config file directly | pass `config: null` |
| `profile` (`<config_dir>/configs/<profile>.json`, ≡ `ANTHROPIC_PROFILE`) | loads a named profile from the config dir | pass `profile: null` |

**The belt (constructing the client):** pass `baseURL` + `authToken` (OR path) or `apiKey`
(first-party) from the resolved credential, AND set `apiKey`/`credentials`/`config`/`profile` to `null`
for the arms not used (an explicit `null` suppresses the fallback per each field's doc), so no config-
file / profile / ambient path can fire. This CORRECTS §3d tier-1's "there is no token an anth-direct
request COULD send": the resolved-credential object is empty for the sub, but the SDK could lazily mint
one from host config — the belt closes that by pinning every ambient knob. This is the SDK equivalent of
the firewall's "every knob set EXPLICITLY."

**A NAMED test (part 04 W8):** construct the anth-direct client in a process with a poisoned ambient
env + a fake `config_dir` holding a `user_oauth` credentials file (the shape the owner's `claude login`
leaves), assert the outbound request carries ONLY the explicitly-passed OR Bearer token and NEVER the
ambient/config token — i.e. no ambient resolution can fire on the owner's box.

Sealed inside `backends/anth-direct/` — no cross-backend import (invariant 2).

## 5. Build shape

### 5a. The request builder input

Input: the `anthropic-messages` arm + `ResolvedChatKnobs` from the injected funnel. The runner builds
the SDK's typed `MessageCreateParams` (a wire-field typo is a compile error). All shaping is a pure
translate over SHAPE's already-final history (one shaping home — part 01 route B stays killed).

### 5b. messages + system

- **messages array:** `ChatHistoryMessage[]` → the SDK's `MessageParam[]` (role + content blocks;
  `name` has no Anthropic field — the egocentric view already renders speaker labels into text upstream,
  same as the agent-sdk seed path). `tool` rows cannot occur (tool-less arm).
- **system:** the SDK's `system` param as a `TextBlockParam[]`: `[{type:"text", text: static,
  cache_control:{type:"ephemeral"}}, {type:"text", text: dynamic}]` — the per-block pin at the stable
  prefix (the measured Esoteric-§5 rule, same split as `shared.ts:69-87`). When the resolved
  `dynamicContextChannel` is `message-tail` (part 01 §5) AND `turns.midConversationSystem` is true, the
  dynamic half instead becomes a `role:"system"` MESSAGE placed immediately after the last user turn
  (the part 01 §2 placement rule, wire-tested) — the cache-safe channel, first-class instead of
  hook-smuggled.

### 5c. prefill · thinking · sampling

- **prefill:** `turns.assistantPrefill:true` ⇒ a trailing assistant `MessageParam` is DELIVERED
  verbatim; `false` ⇒ SHAPE already normalized (part 01 §5 / part 04 W5 — the delivery gate is
  mandatory, a miss is a HARD 400 surfaced as a `BadRequestError`).
- **thinking:** from `ResolvedChatKnobs.reasoning` → the SDK's `thinking` param — adaptive models get
  `{type:"adaptive"}`, budget models `{type:"enabled", budget_tokens}`; the funnel already drops illegal
  combos (Esoteric §8 — `budget_tokens` on Opus 4.8 is a live 400).
- **sampling:** the resolved knobs → `temperature`/`top_p`/`top_k`/`stop_sequences` — present only where
  the part 03 §3 per-model capability let them survive the funnel (post-cutoff models resolve `{}`, so
  the runner never sends a value the wire would 400). `max_tokens` is REQUIRED on `MessageCreateParams`
  (`messages.d.ts:1982`) — from the resolved output cap.

### 5d. cache\_control — REUSE the hoisted placer, emit the R1 PAIR

> **LIVE FINDING (probe-confirmed 2026-07-10 — first read overturned by a raw-REST cross-check):** OpenRouter's
> `/v1/messages` **DOES cache** — a raw-REST probe measured **13001 cache_read** (streaming AND non-streaming).
> The anth-direct dual-arm probe initially reported **0 read / 0 write**, but the root cause was OURS, not OR's:
> OR's `/v1/messages` passthrough delivers the INPUT-side usage (input + cache read/write) in the FINAL
> `message_delta` event, whereas direct Anthropic puts it in `message_start` (which OR sends **all-null**). The
> reducer read cache tokens from `message_start` only → reported 0 **while the cache was working the whole
> time** (OR cached it; we just read the receipt from the wrong envelope). FIX: `reducer.ts` `applyMessageDelta`
> now max-merges the input/cache usage across BOTH envelopes. So **`explicitPromptCache` is TRUE** for
> anth-direct — a real caching wire, like the other Anthropic shapes. The R1 PAIR spec below applies to the OR
> chat-completions runner (W3) AND the anth-direct wire. **LESSON:** a live receipt reading 0 is NOT proof the
> feature is off — cross-check the raw wire (here `provider`-pin and beta-header dead ends both wasted a
> conclusion) before declaring a provider limitation.

R1 (ledger) is the rolling PAIR — the runner pins `cache_control` at `depth` AND `depth+2` from the ONE
safe offset SHAPE computes, keeping a cache hit inside Anthropic's 20-block lookback window a single
breakpoint drops on a long conversation. Both breakpoints sit on already-cached stable content, so the
second is a FREE read — no cost. This is COMMITTED behavior, not an option.

**The current code is a regression to fix (part 04 W3).** Today `placeHistoryCacheBreakpoint`
(`chat-completions.ts:79-84`) places ONE block; the `shape.ts:131-133` header already SPECS the pair
("it pins `depth` AND `depth+2` from this single safe offset") but the runner doesn't emit it — a code
gap AND a drifted header (a comment-law defect). W3 makes the placer emit the pair and fixes the
header to match.

**The kit-hoisted shared placer.** The OR chat-completions runner runs the correct setup: #1 the static
system block (`shared.ts:79` `cacheControlBlock`), #2/#3 the ROLLING PAIR whose offset SHAPE computed
(R1) and the placer places (offset-from-end, empty-filter-robust, min-tokens-gated). The placer is
HOISTED to `backends/kit/` (the strategy-isolation seam — backends never import each other, invariant 2;
`kit/cache-control.ts` already documents the paired half). The hoisted core stays PURE positional logic
(which message indices `depth`/`depth+2`, gated on tokens); anth-direct applies the SDK's
`CacheControlEphemeral` block shape at those indices, the OR runner applies the OpenAI-compat
`ChatContentText` shape — the placer returns the offset decision, each runner emits its wire dialect.
Gated on `turns.explicitPromptCache` + the per-model `turns.cacheMinTokens` (fail-closed to
`CACHE_MIN_FLOOR` when absent — part 01 §4b). Slots: 1 system + 2 rolling = 3 of 4 used; the 4th stays
reserve.

**Per-model cache facts (Anthropic prompt-caching docs, pinned 2026-07-10) — the `cacheMinTokens`
source table** (the resolver derives from this; the OLD ratified-draft "4096 for Opus 4.8" was WRONG —
corrected here):

| model | min cacheable prefix (tokens) |
| - | - |
| Opus 4.8 | 1024 |
| Opus 4.7 | 2048 |
| Opus 4.6 / 4.5 | 4096 |
| Sonnet 5 / 4.6 / 4.5 | 1024 |
| Haiku 4.5 | 4096 |
| Fable 5 / Mythos 5 | 512 |

Constraints/levers:

- **4 breakpoints MAX** per request; the rolling PAIR + the system block use 3.
- **THE 20-BLOCK LOOKBACK:** the API checks at most 20 positions back per breakpoint — the PAIR
  (`depth`/`depth+2`) keeps a hit inside the window as the tail grows past a single breakpoint's reach.
- **Per-model THINKING-BLOCK cache invalidation:** Opus 4.5+/Sonnet 4.6+ PRESERVE cached thinking
  blocks when non-tool-result user content is appended; ALL Haiku (and earlier) STRIP them → cache
  invalidated. A caveat when reasoning turns sit inside the cached prefix; a later capability fact only
  if it starts driving placement (not one now).
- **TTL:** `{type:"ephemeral"}` = 5-min TTL at 1.25x write (default); `ttl:"1h"` = 1-hour at 2x write.
  anth-direct MAY offer 1h on the static system block for a very stable prefix — an option, default 5m.

### 5e. Response, streaming, errors, statelessness

- **Streaming:** the SDK's typed `Stream<RawMessageStreamEvent>` from `messages.create({stream:true})`
  (`messages.d.ts:32`) — the SDK parses the Anthropic SSE dialect itself, so the runner drains a typed
  async iterable (like the OR SDK's `EventStream`, not the kit's `parseOpenAiSse`). A small reducer
  accumulates text/thinking deltas and feeds `onDelta` like the OR runner's `reshapeChatStreamChunk`.
- **Result mapping → `ChatResult` (`contract/chat.ts:288-331`):** `text` → `reply`; `thinking` →
  `reasoning`; `redacted_thinking` → `reasoningRedacted:true`; `stop_reason` → raw provenance + the
  existing `normalizeFinishReason` (`chat.ts:191-219` already maps every Anthropic stop string incl.
  `refusal→filter`); `usage.input_tokens`/`output_tokens`/`cache_read_input_tokens`/
  `cache_creation_input_tokens` → `ChatUsage` (per-phase cost fields `null` — the Messages API doesn't
  return the OR cost tail; verify-then-add if the OR base exposes it on `/v1/messages`).
- **Error mapping → `ProviderError` (`contract/errors.ts:14-29` — the one taxonomy):** typed SDK
  subclasses (`AuthenticationError`/`RateLimitError`/`BadRequestError`/`APIError` `.status`) map by
  status/kind: 401 → `auth_failed` · 429 → `rate_limit` (+ retry-after) · 5xx/529 → `server`
  (retryable) · billing/credit 4xx → `billing` · 400 prefill-unsupported → `invalid`, non-retryable,
  `providerCode` (unreachable once the delivery gate runs — a firing is a caps-matrix bug signal) · 400
  placement-violation → `invalid` + `providerCode` (placement is correct by construction) · 400
  sampling-deprecated (part 03 §3) → `invalid` + `providerCode` (unreachable once the resolver fact is
  seeded). Error bodies pass through the sanitize kit path — never raw into logs.
- **Statelessness:** NO session store, NO seed/resume — Anthropic's prefix cache is content-keyed;
  byte-stable request building IS the cache strategy (the fact that makes the agent-sdk deterministic
  reseed work, Tier-3b Esoteric §3/§5b). `warmSpareClaimed`/`contextUsage`/`mcpServerHealth` are
  `null`/absent (stateless-backend semantics already defined on the contract).

## 6. Security summary (flag for the security-executor build) + verification

1. **THE SUB-EXCLUSION (§3d)** — enforcement tiers 1–3 land together.
2. **Egress** — the global-dispatcher finding (§4); never a private `Agent`/custom fetch.
3. **The extended explicit-auth belt (§4)** — pin `apiKey`/`authToken`/`baseURL` AND
   `credentials`/`config`/`profile` (all to `null` for the unused arms), + the named no-ambient-resolution
   test on the owner's box.
4. **Key handling:** the key arrives only as a brand-protected `ResolvedCredential` (v1: the existing
   `OpenRouterCredential`), minted by the domain factories; AES-GCM AAD `${userId}|openrouter` already
   holds. The key appears ONLY in the SDK's outbound Bearer header — never in logs/events/error bodies
   (`securityEvent` carries source/role/api vocab only, `firewall.ts:17`; error bodies via the sanitize
   kit path).
5. **cache\_control / mid-conv-system are METADATA vs CONTENT:** `cache_control` is pure wire metadata
   (never model-visible). The mid-conv-system row's CONTENT is exclusively the operator-authored
   `systemPrompt.dynamic` half that already exists on every request (`chat.ts:114`) — no new content
   channel, no user/AI-authored text promoted to system authority (and per standing doctrine, AI output
   is never macro-resolved).
6. **No preset escape hatch on this backend** (§2 — no `customParameters` on the arm).

**Verification:** a hand-run live probe `scripts/probes/anth-direct-cache-probe.ts` (the
`sdk-cache-probe` sibling): per-turn cacheRead/cacheWrite across the R1-pair matrix, prefill on/off per
model, mid-conv-system placement, AND the part 03 §3 per-model sampling honor matrix
(temperature/top\_p/top\_k per model — the fact that seeds the resolver) — on the OR base (v1). Re-run
after any SDK bump. Plus: contract tests on the new arm, runner unit tests over a fake `AnthClient`,
the §3d/§4 firewall + no-ambient-resolution tests.
