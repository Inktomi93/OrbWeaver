---
kind: spec
status: draft
updated: 2026-07-10
---

# 01 — the capability model (D66): the `turns` axis, the wire-shape key, the funnel→apply flow

The `README.md` index carries the status, the anti-ST bar, and the one rule. This part is D66: the new
capability axis, the LOAD-BEARING fix that makes its per-shape cells producible, the funnel→apply flow
for every concern, the role-merge prefix-cache fix, and the user role-handling knob.

## 1. The problems, precisely

The funnel already works for BODY params: `resolveModelCapability` produces the descriptor once per
`(model, source)` and `resolve-chat.ts:214` projects `UserIntent × ModelCapability → ResolvedChatKnobs`
(`contract/resolve.ts:77`), dropping un-honorable knobs with structured warnings. Both OR runners
consume the identical resolved decision (`chat-completions.ts:220`, `responses.ts:460`), as does the
agent-sdk translate (`translate.ts:341`). **Effort is the template: resolved once, carried as a
capability, mapped at the edge** (`ModelCapability.reasoning.effortLevels` → `resolveEffort` clamp,
`resolve-chat.ts:83-99`). The gaps below never got the treatment.

### Finding 1 (LOAD-BEARING) — the per-(wire-shape × model) cell is currently UNPRODUCIBLE

The whole design keys turn-caps on (WIRE-SHAPE × MODEL): haiku prefill `true` on the openai-compat
shape but `false` on the `cli` transport; opus-4.8 `midConversationSystem` `true` on the
anthropic-messages shape but `false` on openai-compat. **Today those cells can never execute.** Verified:

- `resolveModelCapability` runs the curated lookup FIRST, and returns the ONE curated descriptor
  before any switch — `resolve-model-capability.ts:190-193` (`const curated = getChatModel(model); if
  (curated !== undefined) return curated.capability;`). A curated-matching Claude id gets one
  descriptor regardless of api/source.
- The resolver receives `source`, NOT `api` — `resolveModelCapability(model, source, orEntry,
  agentSdkModels)` (`resolve-model-capability.ts:184-189`); `resolveCapability(model, source, cached,
  agentSdkModels)` (`substrate/capability.ts:20-28`) passes no api either.

So a curated Claude on the openai-compat wire (Claude-via-OR chat-completions) and the SAME Claude on
the anthropic-messages `cli` wire get byte-identical `turns` cells — the per-shape distinction the
design rests on is invisible. **This part's §3 threads `api` into the resolver so the cells are real.**

### 1a. Prefill is guarded universally, but support is per-model — and a miss is a HARD 400

Today's guard sites (all model-blind):

| site | behavior | file:line |
| - | - | - |
| WRITE guards (4×) | zod-reject `assistant@depth-0` — "unsupported across providers" | `contracts/src/persona/index.ts:62-67` · `contracts/src/chat/index.ts:799-804` · `contracts/src/world-info/index.ts:94-99` · `contracts/src/character/index.ts:61-70` |
| splice normalization | assistant\@0 injection force-floored to depth 1 | `domain/chat/assembly/injections.ts:126-129` |
| trailing-user invariant | a history ending on assistant gets `CONTINUATION_NUDGE` appended | `domain/chat/assembly/shape.ts:100-102, 239-243` |

Wire-tested (2026-07-10, OR openai-compat chat-completions, trailing-assistant continuation): **prefill
is per-MODEL and a miss CRASHES the turn** — `opus-4.5` ✓ continued, `haiku-4.5` ✓, `opus-4.8` ✗,
`sonnet-4.6` ✗, where ✗ is a HARD 400 "This model does not support assistant message prefill. The
conversation must end with a user message." The gate is MANDATORY: a prefill-capable model wants the
true continuation; a non-capable one MUST be normalized at delivery or the turn 400s.

### 1b. The dynamic-context channel is model-gated, but routed by a user knob

`routeDynamicContext` (`agent-sdk/runner.ts:189-205`) picks where the volatile system-prompt half
rides, keyed on `advanced.agentSdkDynamicContext` (`contracts/src/preset/index.ts:174`, default
`"system"`): `"system"` joins into the one system string (any dynamic change re-writes the whole cached
system block — \~12.7k tokens per scene change, probe-measured); `"hook"` rides a `UserPromptSubmit`
hook at the message tail (cache-safe). Wire-proven (`scripts/probes/sdk-hook-wire-probe.ts`) + live-
tested on OR (§2): the hook's `additionalContext` lands as a REAL mid-conversation `role:"system"`
message on Opus 4.8 (the `mid-conversation-system-2026-04-07` beta), demoted to `role:"user"` on Haiku.
So the channel's AUTHORITY is model-gated — yet the default is cache-hostile `"system"` for everyone.

### 1c. The role-merge cache bug (fix: §6)

`squashSameRole` (`role-squash.ts:29-45`) merges adjacent same-role rows at every shaping boundary,
applied unconditionally. Probe-verified failure: a depth-1 injected note whose role matches the LAST
STABLE canon row merges INTO that row (`role-squash.ts:38-40`, first-wins), mutating bytes inside the
previously-cached prefix. The Anthropic prefix cache is content-keyed and all-or-nothing at the mutated
point — the ENTIRE conversation re-bills every turn the note is active. The breakpoint math already
ABORTS the tag (`shape.ts:169-175` ABORT #2) but an aborted tag does not un-mutate the prefix.

### 1d. The rolling cache breakpoint is the R1 PAIR — the current single is a regression

R1 (ledger) committed a rolling PAIR: the runner pins `cache_control` at `depth` AND `depth+2` from the
ONE safe offset SHAPE computes — the pair keeps a cache hit inside Anthropic's 20-block lookback window
that a single breakpoint drops on a long conversation (both breakpoints sit on already-cached stable
content, so the second read is FREE — no cost). The `shape.ts` header states this contract: "ST's
rolling PAIR is the runner's job (it pins `depth` AND `depth+2` from this single safe offset)"
(`shape.ts:131-133`). **But the runner places ONE** (`placeHistoryCacheBreakpoint`,
`chat-completions.ts:79-84` — a single `cache_control` block at one index). So the single-breakpoint
code is the REGRESSION, and the `shape.ts:131-133` header is DRIFTED (claims a pair the code doesn't
emit — a defect per the comment law). A wave (part 04 W3) closes both: emit the pair, fix the header.

### 1e. The wire-shape frame — where OR is (and isn't) capability-rich

Turn-caps key on the WIRE-SHAPE the source implies × the MODEL — NOT on the credential source. Three
distinct wire shapes serve chat:

**The agent-sdk shape (anthropic-messages over the `cli` transport; modes 1/2/3 — sub, OR key, vllm).**
Verified in `env.ts`/`translate.ts`: `disciplineOptions` (`translate.ts:70-105`) dispatches ONLY the
env builder on `credential.source`; `runner.ts:131-151` builds byte-identical `gen.options` +
`dynamicHook` + `systemPrompt`. The OR-key mode only swaps `ANTHROPIC_BASE_URL→openrouter.ai/api` + the
auth token (`env.ts:314-315`). **All three modes emit byte-identical Anthropic `/v1/messages` bodies
and share ONE capability profile per model.** Live-tested (§2): OR's anthropic proxy fully HONORS
mid-conv-system on Opus 4.8 — the OR-key mode gets it exactly like the sub.

**The openai-compat shape (the separate `openrouter` backend — `runners/chat/chat-completions.ts` +
`shared.ts` + `responses.ts`, via `@openrouter/sdk`).** A DIFFERENT wire (OpenAI messages). Types read
in `node_modules/.pnpm/@openrouter+sdk@0.13.19/…/models`:

- **`ChatRequest.cacheControl?: AnthropicCacheControlDirective`** (`chatrequest.d.ts:102-106`)
  top-level AND **per content-part** `ChatContentText.cacheControl` (`chatcontenttext.d.ts:13-19`). Our
  runner uses the per-part form on the static system block already (`shared.ts:79`, `cacheControlBlock`).
- **`ChatMessages`** is a union incl. `ChatSystemMessage`/`ChatDeveloperMessage`
  (`chatmessages.d.ts:10-12`) — a mid-array `role:"system"`/`role:"developer"` message is TYPE-LEGAL.
  But live-tested (§2): a mid-array system message is ACCEPTED (200) yet carries NO operator authority
  — the model distrusts it. → **operator authority is anthropic-wire-only**; dynamic context stays in
  the cached system-block here.
- **Assistant message any-position** (`chatassistantmessage.d.ts:21-55`) — prefill is type-legal and
  per-model HONORED (§2).
- **`ChatRequest.reasoning` / `reasoningEffort`** (`chatrequest.d.ts:54-76,182-188`) — first-class;
  first-class `minP` (`chatrequest.d.ts:152`). NO verbosity field (part 03).

What OR does NOT expose (text chat): `supportedParameters` (`contracts/src/connection/index.ts:202-203`)
is generation params only — no prefill/alternation/system-placement member; the rich
`CapabilityDescriptor` is on IMAGE endpoints only (`sg`-verified).

**The anthropic-messages `direct` shape** — the new anth-direct backend (part 02); same wire, different
transport (`cli` vs `direct`, §4).

### 1f. Why a `direct` transport exists — the CLI-denied wins (D67, part 02)

The agent-sdk backend reaches Claude through the bundled Claude Code CLI subprocess — the CLI owns the
wire body. Four controls are unreachable there and become ours on a raw request: explicit
`cache_control` placement (up to 4 breakpoints) · clean context (no `<system-reminder>`/`# userEmail`
CLI scaffolding — `sdk-hook-wire-probe.ts` mode-1) · prefill + hand-placed mid-conv-system without a
subprocess · Claude SAMPLING (the agent-sdk options carry no sampling field; curated Claude entries
ship `sampling: {}` — `chat-models.ts:38-41`). Detail + receipts: part 02 §0; the sampling unlock is
part 03 §3.

## 2. The honor matrix — wire-tested (2026-07-10) or type-read; every cell decided

"SEND" = the wire type accepts it (+ whether our runner emits it today). "HONOR" = the model actually
applies it. The anthropic-messages wire splits by TRANSPORT (`cli`/`direct`, §4) where the fact is
delivery-dependent.

| wire-shape (× transport) | prefill | cache\_control | mid-conv system authority | sampling |
| - | - | - | - | - |
| **openai-compat chat** (`@openrouter/sdk` `ChatRequest`; the `openrouter` backend) | SEND type-legal; `buildHistoryMessages` (`shared.ts:151-164`) already transmits a trailing-assistant verbatim. HONOR **per-model, wire-tested**: opus-4.5 ✓ · haiku-4.5 ✓ · opus-4.8 ✗ (HARD 400) · sonnet-4.6 ✗. | SEND type-legal, top-level + per-part; runner uses per-part on the static system block + the rolling breakpoint (`chat-completions.ts:59-84`). HONOR **docs-confirmed** Anthropic Claude. Min cacheable prefix is PER-MODEL (part 02 §5d — 1024 for Opus 4.8, 4096 for Haiku 4.5). | SEND type-legal (mid-array system/developer). HONOR **wire-tested NO** — 200 but no operator authority. → keep dynamic context in the cached system-block here. | full OpenAI-compat set incl. first-class `minP` (`chatrequest.d.ts:152`) — synthesized per model from `supportedParameters` (part 03 wires what's dropped today). |
| **openai-responses** (`ResponsesRequest`; `runners/chat/responses.ts`) | SEND assistant-first guarded; trailing-assistant untested (out of scope). | top-level `cacheControl` only — per-block NOT exposed on Responses; our top-level is a measured no-op kept for forward-compat (`responses.ts:186-188`). | not the mid-conv-system path today. | temperature/topP mapped today; `topK` exists un-mapped (`responsesrequest.d.ts:176`); NO `minP` field; `verbosity` lives HERE — `text.verbosity` (`textextendedconfig.d.ts:22`) — the D68 wire home (part 03). |
| **anthropic-messages / `cli`** (the agent-sdk backend — modes 1/2/3, ONE caps profile per model) | none — the sub/OR-key CLI never emits prefill (Claude 4.6+ refuse it anyway). | CLI-owned per-block; HONOR wire-proven on the sub (`sdk-cache-probe.ts`); on the OR key docs-confirmed + live-tested 200. | mid-conv-system hook = **wire-proven** `role:"system"` on Opus 4.8 (`sdk-hook-wire-probe.ts`), demoted to user on Haiku. **Live-tested on OR: 200, HONORED.** So `midConversationSystem = TRUE` for Opus 4.8 on sub AND OR-key. | NONE — the SDK options carry no sampling field; curated Claude `sampling: {}` (`chat-models.ts:38-41`). |
| **anthropic-messages / `direct`** (anth-direct, part 02) | per-MODEL, the SAME live matrix (Anthropic's own error): opus-4.5/haiku-4.5 `true`; opus-4.8/sonnet-4.6 `false`. | HONOR is the wire's; the PLACEMENT is OURS — the R1 PAIR within the 4-breakpoint cap (part 02 §5d). | same honor fact as `cli` (Opus 4.8 `true`) — but we hand-place the `role:"system"` row, obeying the placement rule below. | `temperature`/`top_p`/`top_k`/`stop_sequences` exist on `MessageCreateParams` — **PER-MODEL, post-Opus-4.6-deprecated** (part 03 §3); resolver-derived, probe-seeded, fail-closed. |

**The placement rule (Anthropic, wire-tested through OR).** A mid-conv-system message MUST immediately
follow a user turn (or an assistant turn ending in a server tool result) and be last (or followed only
by an assistant turn); wrong placement = 400 "role 'system' must follow a 'user' message". Our hook
already satisfies this. The design GUARANTEES it: the resolver never emits `midConversationSystem:true`
for a shape/position that can't honor the placement, and the runner only ever routes the hook (`cli`)
or the builder-placed row (`direct`, placement-correct by construction, part 02 §5d) — never an
arbitrary hand-placed mid-array system row.

## 3. THE FIX — thread `api` into the resolver (Finding 1)

Without this, §1 Finding-1 stands and the per-shape cells never execute. The wire-shape is a function
of `(api, source)` — `deriveRunner`'s inputs — but the resolver must not import the sealed
`deriveRunner`/`BackendKey` (that vocab never leaves infra, Tier-3b invariant 3). So the resolver
derives a DOMAIN-side wire-shape enum from `(api, source)` and keys the curated refinement on it.

**The carriage (a contract change the wave lists — part 04 W1).**

1. A new domain wire-shape union in `domain/connection/catalog/` (one home, string-union dispatch):
   `WIRE_SHAPES = ["openai-compat", "openai-responses", "anthropic-cli", "anthropic-direct"] as const`.
   A pure `deriveWireShape(api, source): WireShape` maps the coherent `(api, source)` pairs
   (`assertNever`-exhaustive): `("chat-completions", *)` / `("responses", *)` → the openai shapes;
   `("agent-sdk", *)` → `anthropic-cli`; `("anthropic-messages", *)` → `anthropic-direct`. It lives
   beside `resolveModelCapability`, imports no infra.
2. `resolveModelCapability` gains an `api: ChatApi` parameter (added at
   `resolve-model-capability.ts:184-189`); `resolveCapability` (`substrate/capability.ts:20-28`) and its
   two callers (`verbs/resolve-role.ts:192`, `verbs/get-model-capability.ts:19`) thread it through —
   **`selection.api` is already in scope at the `resolve-role.ts:192` call** (`assertCoherent(selection.api,
   selection.source)` runs one line up at `:185`), so the caller change is a single argument, no new
   plumbing.
3. **Curated entries carry per-wire-shape `turns` cells.** `getChatModel` returns the curated entry;
   the resolver applies a documented refinement step — `refineCuratedTurns(entry, wireShape)` — that
   selects the `turns` cell for the resolved shape from a small per-entry map (the honor facts in §2:
   e.g. Opus 4.8 → `midConversationSystem:true` on `anthropic-cli`/`anthropic-direct`, `false` on the
   openai shapes; Haiku → prefill `true` on openai-compat, `false` on `anthropic-cli`). Everything
   OUTSIDE `turns` (reasoning/sampling/output/context) is shape-invariant and returned unchanged, so
   the curated-first short-circuit stays correct for those axes — only `turns` is shape-refined.

This keeps the ONE-home bar: the shape is DERIVED inside the catalog from `(api, source)`; no consumer
sees a wire-shape string, and no runner reads a model id. The correction to the prior draft's false
claim "the resolver already receives the api" is this whole section — it does NOT today; §3 makes it so.

## 4. The `turns` axis + its derivation + the transport axis

### 4a. `ModelCapability.turns` (the schema)

Add to `modelCapabilitySchema` (`contracts/src/connection/index.ts:131`), optional like `input`/`tools`
so every existing constructor stays valid:

```ts
/** Turn/message-array capabilities (D66). Absent ⇒ TURNS_FLOOR (the conservative today-behavior). */
turns: z
  .object({
    /** The wire accepts a DELIVERED trailing-assistant message as response prefill. false ⇒ SHAPE
     *  normalizes/nudges at delivery — MANDATORY: a false-model that receives a trailing assistant
     *  HARD-400s (wire-tested opus-4.8/sonnet-4.6). Per-model, per-TRANSPORT on anthropic-messages. */
    assistantPrefill: z.boolean(),
    /** A mid-conversation system-AUTHORITY channel exists AND this model honors it, placement-correct.
     *  Keys on (wire-shape × model): TRUE on the anthropic-messages shape for Opus 4.8 (both
     *  transports — a wire-honor fact); FALSE on the openai-compat shape (accepted, no authority). */
    midConversationSystem: z.boolean(),
    /** The MODEL/wire FLOOR for adjacent-same-role handling. Anthropic messages hard-rejects adjacent
     *  same-role → `strict`. The user knob (§7) may go STRICTER, never looser. A `ROLE_HANDLING`
     *  member. NOTE (§7a): SHAPE's role vocab is user|assistant only (system→user at splice), so
     *  strict-vs-merge differ only in whether adjacent same-role rows combine — the floor is about
     *  MERGING, not system-row semantics. */
    roleHandlingFloor: roleHandlingSchema,
    /** Explicit prompt caching is worth placing on this (wire-shape × model) — the SHAPE-computed
     *  rolling breakpoint PAIR + per-block cache_control. Anthropic Claude on both shapes qualify
     *  (§2); a non-Anthropic model does not (OR auto-caches non-Anthropic with no field —
     *  kit/cache-control.ts:6-8). */
    explicitPromptCache: z.boolean(),
    /** The PER-MODEL minimum cacheable prefix (tokens) — below it a breakpoint burns a slot and never
     *  forms a cache entry (part 02 §5d table; fixes the hardcoded ANTHROPIC_CACHE_MIN_TOKENS=1024 —
     *  Haiku 4.5 = 4096 undercaches today, chat-completions.ts:45). Read only when
     *  `explicitPromptCache`; a CACHE_MIN_FLOOR default applies when absent (§4b). */
    cacheMinTokens: z.number().int().positive().optional(),
  })
  .optional(),
```

The `ROLE_HANDLING` union (declared once beside the schema — §5.5 dispatch discipline; the `developer`
reservation is D66-D, part 04):

```ts
export const ROLE_HANDLING = ["none", "merge", "semi-strict", "strict"] as const;
export type RoleHandling = (typeof ROLE_HANDLING)[number];
export const roleHandlingSchema = z.enum(ROLE_HANDLING);
```

Plus one exported floor constant (one home; every consumer defaults through it):

```ts
export const TURNS_FLOOR: NonNullable<ModelCapability["turns"]> = {
  assistantPrefill: false,
  midConversationSystem: false,
  roleHandlingFloor: "strict",
  explicitPromptCache: false,
} as const;
```

`TURNS_FLOOR` is byte-identical to current ENGINE behavior; `explicitPromptCache:false` is the one
field whose floor differs from a runner's CURRENT unconditional Anthropic-cache placement, so W1 seeds
it `true` (+ the per-model `cacheMinTokens`) for every Claude entry/family to hold today's behavior.

### 4b. How the resolver derives each flag (all facts decided; keyed on the derived wire-shape, §3)

All derivation stays inside `domain/connection/catalog/`. "curated" = the shape-refined curated entry
(§3); "OR openai-compat synthesis" = the `openrouter`-shape synthesis (`resolve-model-capability.ts:133-152`).

| flag | curated (per §3 refinement) | OR openai-compat synthesis | static profiles |
| - | - | - | - |
| `assistantPrefill` | `anthropic-cli`: `false` (the CLI never emits prefill; 4.6+ refuse). `anthropic-direct` / `openai-compat`: the live matrix — opus-4.5/haiku-4.5 `true`, opus-4.8/sonnet-4.6 `false` (resolver-internal version checks — the ONE place allowed to read a model id). | `FAMILY_TURNS` (mirrors `FAMILY_REASONING`, `resolve-model-capability.ts:46-56`), anthropic per-VERSION facts seeded by the same live matrix. Every non-anthropic family `false` (fail-closed). | `false`. |
| `midConversationSystem` | Opus 4.8 = `true` on `anthropic-cli`/`anthropic-direct` (wire-tested; a wire-honor fact identical on both transports), `false` on the openai shapes; Sonnet 5 / Haiku = `false` everywhere. | `false` — operator authority is anthropic-wire-only (wire-tested). | `false`. |
| `roleHandlingFloor` | `strict` for all Claude entries (Anthropic rejects adjacent same-role) — every shape. | anthropic `strict`; **open-weight families floor to `strict` (fail-closed) via the EXISTING `model-family.ts` family detection** — NO per-model instruct signal (dropped: the owner ruled instruct mode out). A future looser floor for a family that provably tolerates adjacency is a family-keyed change, evidence-gated. | `strict`. |
| `explicitPromptCache` + `cacheMinTokens` | `true` for all Claude entries; `cacheMinTokens` per the part 02 §5d table (Opus 4.8 = 1024, Haiku 4.5 = 4096, …). | **anthropic family ⇒ `true`; every other family ⇒ `false`** (ruling 3: OR auto-caches non-Anthropic models with no field — `kit/cache-control.ts:6-8` — so a `cache_control` emit on a non-anth wire mis-fires; cache pricing does NOT imply this flag). anthropic `cacheMinTokens` per the table. | `false`. |

**The `cacheMinTokens` fail-closed default.** `placeHistoryCacheBreakpoint` requires a `number`
(`chat-completions.ts:58-64`). When `explicitPromptCache` is true but `cacheMinTokens` is absent, the
runner passes an exported `CACHE_MIN_FLOOR` constant — the CONSERVATIVE (highest common) floor, `4096`
(so an unseeded entry never under-caches by placing a breakpoint below the real floor). A curated entry
always carries its exact value; the default only guards a synthesized/unseeded arm.

The daemon catalog (`agentSdkModelSchema`, `contracts/src/connection/index.ts:218-233`) reports
effort/adaptive flags only. **Future daemon turn-caps seam:** `resolveAgentSdkAlias` already maps the
daemon row → capability; when `supportedModels()` grows prefill/mid-conv fields, the `max-pro-sub` arm
PREFERS the live daemon fact (the existing override-when-present pattern,
`resolve-model-capability.ts:199-201`). Designed now, inert until the field exists.

### 4c. The transport axis — `cli` vs `direct` under the anthropic-messages wire (D67-B)

anth-direct shares the anthropic-messages WIRE with the agent-sdk backend but differs in TRANSPORT:
`cli` (the subprocess owns the body) vs `direct` (we own the body). The split is load-bearing because
the wire's column above mixes two kinds of fact:

| `turns`/sampling cell | kind of fact | cli (agent-sdk) | direct (anth-direct) |
| - | - | - | - |
| `midConversationSystem` | WIRE×MODEL honor fact | true for Opus 4.8 (hook channel) | true for Opus 4.8 — we hand-place the row (§2 placement rule) |
| `roleHandlingFloor` | WIRE fact | `strict` | `strict` — identical |
| `assistantPrefill` | DELIVERY fact (transport-dependent) | `false` — the CLI never emits prefill | per-MODEL, the live matrix |
| `explicitPromptCache`/`cacheMinTokens` | honor is wire; APPLY is transport | `true` but the CLI owns placement | `true` AND the placement is OURS (the R1 pair, part 02 §5d) |
| `sampling` | DELIVERY + per-model wire fact (part 03 §3) | none — no SDK field | per-MODEL `{temperature, topP, topK, stop}` where the model still accepts them |

The §3 `deriveWireShape` maps `("agent-sdk", *) → anthropic-cli` and `("anthropic-messages", *) →
anthropic-direct`, so the resolver produces the right transport cell per §4b. `resolve-chat.ts` stays
what Tier-3b invariant 9 says: it reads the injected descriptor; the anth-direct runner consumes
`ResolvedChatKnobs` exactly as the OR runners do (and the Opus-4.8 adaptive/budget guard — Tier-3b
Esoteric §8 — is reused for free: `budget_tokens` on Opus 4.8 is a live 400).

## 5. Flow of each concern through the one mechanism

| concern | capability (resolver) | user knob | decision point | mechanical apply |
| - | - | - | - | - |
| effort / reasoning | existing `reasoning` axes | `effort`/`thinkingBudgetTokens`/`thinkingDisplay` | `resolve-chat.ts` funnel (clamp + adaptive/budget guard) | runners map `ResolvedReasoning` (kit `ReasoningRequest` / SDK `ThinkingConfig` / anth-direct `thinking`) |
| sampling (incl. **minP**, part 03) | existing `sampling` ranges/flags (+ the part 03 §3 direct-transport per-model facts) | existing `UserIntent` knobs + NEW `minP` | funnel `resolveSampling` (+ the new `minP` `resolveNumeric` pass) | OR chat: `chatSamplingFields` (+ `minP`); vLLM/BYO: `buildOpenAiSamplingFields` (+ `min_p`); responses: temperature/topP (+ `topK` rider); anth-direct: `temperature`/`top_p`/`top_k`/`stop_sequences` |
| **verbosity** (part 03) | existing `verbosity` levels | NEW `UserIntent.verbosity` | funnel `resolveVerbosity` (member-gated; `verbosity_dropped` warning) | responses runner → `text.verbosity`; chat-completions has NO SDK field (0.13.19) → runner-side drop + warning |
| output cap | `output.maxTokens` | `maxOutputTokens` | funnel clamp | runners (`maxCompletionTokens` / `maxOutputTokens` / anth-direct required `max_tokens`) |
| assistant prefill | `turns.assistantPrefill` | authored via relaxed write-guards (§7b/D66-B) | SHAPE (engine reads the flag — D45/D48): `true` ⇒ deliver the trailing assistant row (no `CONTINUATION_NUDGE`) + splice keeps assistant\@0 at depth 0; `false` ⇒ normalize at delivery (MANDATORY — else 400) | openai-compat transmits a trailing-assistant verbatim (`shared.ts:151-164`); anth-direct delivers the trailing `MessageParam` (part 02 §5d); `cli` stays `false`. |
| dynamic-context channel | `turns.midConversationSystem` | the renamed `dynamicContext` preset knob (part 04 W4) | FUNNEL: `resolve-chat.ts` gains `resolveDynamicContext(params, capability)` → `ResolvedChatKnobs.dynamicContextChannel: "system-block" \| "message-tail"`. Rule: user knob wins when set; absent ⇒ `message-tail` iff `midConversationSystem`, else `system-block`; a `message-tail` on a `false` model emits `dynamic_context_demoted` | agent-sdk: `routeDynamicContext` switches on the RESOLVED channel (ONE path, all three modes); anth-direct: `message-tail` ⇒ a hand-placed `role:"system"` row (part 02 §5d); openai-compat: always `system-block`. |
| explicit prompt cache | `turns.explicitPromptCache` + `cacheMinTokens` | — | RUNNER: the OR cache-placement (`chat-completions.ts:96-105` `isAnthropic` gate) reads the flags for OUR domain-computed PAIR placement | replaces the model-id sniff + the hardcoded 1024; anth-direct reuses the same kit-hoisted placer (part 02 §5d); the sealed wire-dialect `isAnthropicModel` stays. |
| role-merge / alternation | `turns.roleHandlingFloor` (FLOOR) | `roleHandling` + `squashSystemMessages` (§7a) | **SHAPE** (§6 — the clamp AND the merge both live here) | none — the delivered history is already final (prefix-stable per §6). |

Why prefill + role-merge decide at SHAPE not the funnel: the nudge/normalization/merge physically
happens during history assembly (`shape.ts`), BEFORE the runner calls the funnel (`pipeline.ts` order:
SHAPE → FIT → REQUEST → runner → `resolveChat`). Deciding in the funnel would force the provider to
un-append an engine-added row by content-sniffing — the hack this proposal forbids. The engine
consuming a declarative capability flag is the established pattern (vision D45, tools D48/D51); the
funnel gains only the decisions whose apply-site is the provider (dynamic context, sampling/verbosity,
cache placement).

## 6. THE ROLE-MERGE CACHE FIX (prefix-stable; SHAPE is the ONE clamp home)

Message-shape, not a param. The ONE prefix-stable normalization pass; the §7 knob selects WHICH strategy
runs, but every strategy obeys these two rules — and the CLAMP lives HERE at SHAPE (ruling 2: the clamp
belongs where the merge physically happens, so the concern is never split across SHAPE + funnel).

**6a. The effective strategy is capability-floor-clamped AT SHAPE.** `shape()` (`shape.ts:202`) runs
the selected strategy at the three squash sites (`shape.ts:230-243`) instead of an unconditional
`squashSameRole`. The effective strategy = `max(roleHandlingFloor, roleHandling)` under
`none < merge < semi-strict < strict` — computed inside SHAPE, from the floor SHAPE reads off
`capability.turns` and the user `roleHandling` knob SHAPE receives. `none` skips merging entirely
(injected notes stay standalone rows). `computeHistoryBreakpoint` takes the effective strategy: with no
merge, `squashedPrefixLen === stableCount` (`shape.ts:179` is a pass-through) and ABORT #2 is moot.

**The carriage (a contract change the wave lists — part 04 W6).** `roleHandling` is a
`RouteChatAssignment` CONNECTION field (§7a), and today **`ResolvedConnection` carries NO such field** —
so the prior draft's "the resolved knob is already in scope at `pipeline.ts:434`" was FALSE. The fix:
carry `roleHandling` from the resolved connection into `ShapeInput`. Concretely, extend the pipeline
args (or `ResolvedConnection`) with the resolved `roleHandling`, threaded from `resolve-role`
(`selection` already holds the `RouteChatAssignment` fields there) → `shapeTurn({...})` at
`pipeline.ts:434` → `ShapeInput` (`shape.ts:62`), exactly as `namesBehavior` travels. The engine reads a
union member; no model id; the funnel is untouched (stays reads-never-authors, Tier-3b invariant 9).

**6b. Prefix-stable by construction (every strategy that merges).** A merging strategy must NEVER merge
a VOLATILE row upward into the last STABLE canon row. SHAPE knows the stable/volatile boundary
(`stableCount = withTail.length - 1`, `shape.ts:160`; the volatile tail is always the last `withTail`
element, surviving injections splice at depth 0/1 — at/after that boundary). `squashSameRole` gains a
boundary index; a same-role adjacency ACROSS the boundary resolves by re-framing the VOLATILE row
through the one-home operator channel (`frameInjection`, `injections.ts:55` — an assistant/system note
becomes a user-role `[Note from …]` row, the conversion the splice already performs for system-role),
NEVER by mutating the stable row. Deterministic, byte-stable prefix.

**The exact failure this prevents** (probe-verified): active depth-1 assistant-role note + assistant
last-stable row → `role-squash.ts:38-40` rewrites the stable row's content → the content-keyed Anthropic
prefix cache misses → full-conversation re-bill EVERY turn the note is active. Holds on the
anthropic-messages wire (both transports) and on the openai-compat shape wherever `explicitPromptCache`
is true. Not touched: canon-canon merges inside the prefix (committed messages — deterministic
turn-over-turn, so the squashed prefix stays byte-identical; the breakpoint math accounts for the length
change, `shape.ts:139-145`).

## 7. The user knobs (owner rulings A + B)

### 7a. Two role-handling controls (ST-modeled), the capability as the HARD FLOOR

**`roleHandling ∈ {none | merge | semi-strict | strict}` — a CONNECTION-panel field.** Homes beside
`providerRouting` on `RouteChatAssignment` (`contracts/src/connection/index.ts:284-289`) — a
per-connection wire concern, not a generation param.

**What it actually controls at SHAPE (tightened to the real vocab).** SHAPE's message role vocab is
`user | assistant` only — a system-role injection is converted to a `user`-role `[Note from …]` row at
splice (`injections.ts:139-141`: `inj.role === "system" ? "user" : inj.role`, then `frameInjection`).
So there is no bare mid-array `system` row for a strategy to reason about, and the four values differ in
ONE axis — whether adjacent same-role (user|assistant) rows MERGE:

| value | behavior |
| - | - |
| `none` | send rows as-is — no merging. |
| `merge` | combine consecutive same-role rows (the current `squashSameRole` behavior). |
| `semi-strict` | `merge`, and additionally guarantee user/assistant alternation (a stray same-role after merge is folded — rare, since merge already collapses runs). |
| `strict` | strict user/assistant alternation — every non-alternating row is folded into its neighbor. Against the SHAPE vocab (no system rows), `strict` and `merge` are largely output-equivalent; `strict` is the conservative wire floor for Anthropic. |

Do NOT overclaim system-row semantics here — the "leading system row kept" wording of the prior draft
does not apply, because SHAPE has no system rows to keep.

**`squashSystemMessages: boolean` — a PROMPT-panel field.** Homes on `UserIntent.advanced`
(`contracts/src/preset/index.ts:163-176`, beside the renamed `dynamicContext` knob). Merges CONSECUTIVE
system-note runs BEFORE they convert to `user` rows (relevant because injections mint system-role notes,
`injections.ts:139-141`) — an independent collapse the user may want even with `roleHandling:none`.
Applied in BUILD/SHAPE where system notes are framed.

**Floor composition (the invariant).** The effective strategy = the STRICTER of the user knob and the
model floor, clamped AT SHAPE (§6a): the user may go STRICTER than the wire requires but NEVER looser —
a `none` on an Anthropic model (floor `strict`) still delivers the strict/merge behavior, because a
looser choice would 400 the wire. The resolver publishes the floor; SHAPE clamps and runs the strategy.
§0-legal: the MODEL fact lives in the resolver, the USER preference is a setting, no consumer branches on
a model id.

**Reconciled with §6.** WHICHEVER strategy the clamp selects runs the §6 prefix-stable pass — `none`
trivially can't mutate the prefix (no merge); `merge`/`semi-strict`/`strict` all use the boundary-aware
`squashSameRole`, so a volatile row is re-framed, never merged upward. `squashSystemMessages` merges
only ADJACENT system notes in the volatile region (injected notes splice at depth 0/1), so it cannot
mutate a stable prefix row.

### 7b. Relax the assistant\@0 + alternation guards universally (ruling A)

The four contracts WRITE-guards (`persona`/`chat`/`world-info`/`character` assistant\@0 zod-rejects,
§1a) and the unconditional `CONTINUATION_NUDGE` + alternation squash become capability/knob-driven, not
hardcoded rejections. Authored prefill becomes POSSIBLE at the data layer. **Data-outlives-model is
handled by the deliver-time capability gate, not the write-time guard:** a stored assistant\@0 prefill
resolved onto a `assistantPrefill:false` model normalizes at SHAPE delivery (§5 prefill row) — which it
MUST, else the turn 400s. So the write guard is no longer load-bearing for safety; the DELIVERY gate is.
The four `superRefine` prefill rejects are removed (the read/serde path already normalizes legacy values
— `character/index.ts:56-57`); the write schemas keep only shape validation.
