# OpenRouter chat-completions backend — measured findings & fixes

**Status:** findings, none applied · **Date:** 2026-07-30 · **Scope:**
`packages/server/src/infra/providers/backends/openrouter/` (the sealed `chat-completions` runner + `kit`).
**Evidence:** live probes against `anthropic/claude-sonnet-5` via OpenRouter (~$0.24) + the Anthropic native
Messages API. Sibling doc: `rpg-extraction-one-call-spike.md` (different subject; §4a there shares finding 6).

> Separate from the RPG spike on purpose — these are provider-layer defects in the sealed section, found
> while bug-hunting it, and they apply to **every** hosted chat turn, not just rpg.

---

## Ranked

| # | Finding | Fix size | Impact |
|---|---|---|---|
| 1 | `ttl:"1h"` works — our comment says it can't | 1 field | ~$0.018/turn on a 10k prefix |
| 2 | The Anthropic "pin" doesn't pin | 1 field | correctness of a stated guarantee |
| 3 | An invalid TTL silently disables caching | guard + warning | 10× cost, zero signal |
| 4 | `isError` on tool results is silently dropped | warning | D41 no-silent-degrade |
| 5 | Cache breakpoints counted in array offsets, not role switches | small | under-caching on tool-heavy turns |
| 6 | OR under-drives `effort` 3–6× vs native | none (know it) | invalidates effort-based conclusions |
| 7 | Reasoning is never round-tripped | contract change | continuity on long agentic chains |

---

## 1. `ttl: "1h"` is honored on the OR wire — no beta header. Our comment is wrong.

`backends/kit/cache-control.ts` says:

> *"No explicit `ttl` field — the default 5m is shippable everywhere; a 1h variant needs a beta header we
> don't send yet."*

**False on this wire.** Anthropic bills a 5m cache write at 1.25× base input and a 1h write at 2.0×, so the
price multiplier identifies which TTL actually applied. Unique prefix per row, **no `anthropic-beta` header
sent on any of them**:

| arm | cWrite | cost | write multiplier | verdict |
|---|---|---|---|---|
| no `ttl` (what we ship) | 9912 | $0.0248 | **1.250×** | 5m |
| `ttl:"5m"` | 9912 | $0.0248 | **1.250×** | 5m |
| `ttl:"1h"` | 9912 | $0.0397 | **2.000×** | **1h honored** |
| replay of the 1h prefix | 0 (cRead 9912) | $0.0020 | — | cache hit |

SillyTavern ships `ttl` on the OpenRouter wire too, with only `HTTP-Referer`/`X-Title` headers — its
`anthropic-beta` headers are on the *direct Anthropic* path only. The beta header is an Anthropic-direct
requirement that OpenRouter handles for us.

**Economics** (~10k stable prefix): uncached $0.0199/turn → cached read $0.0020. A 5m write costs +$0.0049
over base, a 1h write +$0.0198. One avoided re-write is worth $0.0228, so **1h pays for itself the first
time a session goes quiet for more than five minutes** — which for RP think-gaps is essentially always.

**Fix:** add `ttl` to `ANTHROPIC_CACHE_5M`'s call sites and correct the comment. See finding 3 first.

## 2. `effectiveProviderRouting` does not actually pin Anthropic

`cache-control.ts` returns `{ order: ["Anthropic"] }` and claims it stops a model *"silently landing on a
non-caching endpoint."* It doesn't — `allow_fallbacks` defaults **true**. A probe leaked the routing chain
in an error envelope:

```
provider_name: "Google"
previous_errors: Anthropic → Amazon Bedrock → Azure → Amazon Bedrock
```

**Fix:** `{ order: ["Anthropic"], allow_fallbacks: false }`, or soften the comment to match reality. Note
this interacts with `resolveFallbackModels` — decide whether a caller's `models[]` chain should still apply.

## 3. An invalid `ttl` silently disables caching entirely

`ttl:"9z"` → **200 OK**, `cache_write=0`, `cache_read=0`, cost **$0.0199** — byte-identical to sending no
`cache_control` at all ($0.0199). OpenRouter drops the whole `cache_control` block rather than erroring.

**10× the cost with zero signal.** If TTL ever becomes host-configurable this is a D41 no-silent-degrade
violation waiting to happen. Validate the value at the seam and warn loudly on reject.

## 4. `isError` on tool results is silently dropped

`runners/chat/shared.ts:91` — `toolResultMessages` emits:

```ts
out.push({ role: "tool", toolCallId: part.toolCallId, content: part.content });
```

`ChatContentPart`'s `tool-result` arm carries `isError?: boolean` (`contracts/src/chat/bus.ts`), and the
chat-completions wire has nowhere to put it. It vanishes. D41 says a drop is loud: this needs a
`tool_result_error_dropped` warning alongside the existing `verbosity_dropped` /
`custom_parameters_ignored`.

## 5. Cache breakpoints are counted in array offsets; they should be role switches

`computeCacheBreakpointOffsets` walks raw array offsets from the end. SillyTavern's equivalent
(`cachingAtDepthForOpenRouterClaude`) counts **role switches**, skips the prefill, and skips system rows.
Both use the same `depth` / `depth+2` pair trick.

Why it matters here specifically: `toolResultMessages` expands ONE `tool` history turn into **N** wire
messages (one per part). A caller passing `historyCacheBreakpointFromEnd` in conversational terms gets
silently skewed by tool-result fan-out. `shared.ts:120` already notes empty-turn filtering was done "so the
offset still lines up" — the same reasoning applies to fan-out and wasn't.

Confirmed harmless-but-wrong: a breakpoint placed on a `role:"tool"` message is **accepted** (200,
cWrite 10009). So this under-caches quietly rather than failing.

## 6. OpenRouter under-drives `effort` 3–6× vs the native wire

Identical messages + tools, `claude-sonnet-5`, n=1 per cell:

| effort | native `thinking_tokens` | OR `reasoning_tokens` | ratio |
|---|---|---|---|
| `low` | 122 | 128 | ~1× |
| `medium` | **419** | 108 | 3.9× |
| `high` | **1858** | 297 | **6.2×** |
| `xhigh` | **2791** | 932 | 3.0× |
| `max` | **6291** | 1863 | 3.4× |

Native spreads 51.6× monotonically; OR spreads 17.3× and is non-monotonic at the bottom. **OR's `high`
thinks less than native's `medium`.** Also: OR `max` returned **zero tool calls** while consuming the full
8000-token output cap — a real failure mode for a tool-dependent path.

Nothing to fix in our code, but it scopes every effort-based conclusion we draw to "OR's rendition of
effort," and it means real deliberation depth may be unreachable on this wire at any setting.

## 7. Reasoning is never round-tripped

- `shared.ts:361` `reshapeReasoningDetails` keeps only `type` and `text` — **drops `signature`**.
- `contracts/src/chat/bus.ts` `ChatContentPart` has four arms (text/image/tool-call/tool-result) — **no
  reasoning arm**, so it can't be persisted even if captured.
- `nonToolMessage` emits assistant turns as `content` + `toolCalls` only.

OpenRouter documents that `reasoning_details` should be passed back and that *"preserving reasoning blocks
is useful specifically for tool calling."* The real returned shape (verified):

```json
{ "type": "reasoning.text", "text": "…", "format": "anthropic-claude-v1",
  "index": 0, "signature": "EvYBCokBCBAY…" }
```

`signature` is a **sibling field on the `reasoning.text` object**, not `data`. Replaying unsigned:

```
400  messages.1.content.0: Invalid `signature` in `thinking` block
```

Both replay shapes work: OR's verbatim object, or SillyTavern's rebuilt `reasoning.encrypted` + `data` +
`format` (`addOpenRouterSignatures`, `prompt-converters.js:1391`) — ST's is cheaper since it never sends
text blocks and so can't hit the unsigned-400 at all.

**Measured caveat — the cost case did NOT reproduce.** On a single trivial tool hop, dropping reasoning vs
replaying it: 200 in both cases, `reasoning_tokens = 0` on turn 2 either way, and replaying cost ~18 *more*
input tokens. What's proven is narrower than first claimed: **dropping is safe; replaying wrong is a hard
400.** The case for building it is agentic continuity on long chains, not token savings — so it's a
contract change (`ChatContentPart` + a signature guard) with an unquantified payoff. Lowest priority here.

---

## Not defects — decided against

- **Migrating this path to `@tanstack/ai`.** Evaluated: 13.7k LOC sealed section vs a 0.x SDK covering
  ~2.3k of it. No Anthropic OAuth (kills the agent-sdk backend, 3.3k LOC), no embed/rerank, nothing for the
  vLLM engine supervision (3.3k), and its call-site-picks-an-adapter model is what `providers-runner-seal`
  exists to prevent. Worth reading for its OR Responses handling, not adopting.
- **Switching the Anthropic path to OpenRouter's Anthropic "skin"** (`/v1/messages` passthrough). Gains
  native thinking blocks, 4 cache breakpoints, `tool_result` images/`is_error`, server-side tools. Costs the
  entire provider-routing surface (documented "only guaranteed to work with the Anthropic first-party
  provider"), `models[]` fallback, OR-native `cost`/`costDetails`/`isByok`, and adds a **third** chat dialect
  to maintain. Not worth it — findings 1–5 recover most of the value on the wire we already have.

## Verification

Probe scripts live in the session scratchpad, not the repo (unlike the rpg harnesses). Re-deriving is cheap:
each finding above states its exact arm and the expected number. Findings 1–3 are ~$0.10 to reconfirm,
finding 6 is ~$0.39 and needs **both** `OPENROUTER_API_KEY` and `ANTHROPIC_API_KEY`.
