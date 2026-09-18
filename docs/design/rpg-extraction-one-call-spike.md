---
kind: design
status: active
updated: 2026-08-30
---

# RPG state extraction — one-call-tools spike & recommendations

**Status:** R1 DECIDED · R4b/R4c open · **Date:** 2026-07-29, substantially revised 2026-07-30
**Scope:** hosted (OpenRouter) strong-model rpg turns. Local vLLM 8B path is explicitly out of scope (see §6).
**Evidence:** live spikes against `anthropic/claude-sonnet-5` via OpenRouter + the Anthropic native
Messages API (~$3.6 total spend, 8 harnesses). Raw artifacts under `scripts/probes/rpg-extraction/` — see
Appendix B. Results directories are gitignored; **this document is the durable record.**

> **Vocabulary rider (#901 Fork 3, 2026-08-30 — SCHEDULED, NOT LANDED).** Everywhere below, "cast" /
> "the cast enum" / "cast field" name rpg's SCENE-ONLY extras and their per-game field defs. The owner
> ruled that concept is an **npc**: the actor-ref arm becomes `npc:<slug>` and `castFields` follows,
> under issue **#906** (merge-window class — `cast:<slug>` lives in JSON snapshot values). The
> measurements, tool names and enum spellings below are the RECORD of what was run and stay verbatim;
> read the concept as "npc" and do not respell a captured tool arg to match.

> **OUTCOME 2026-08-01 (owner ruling): the `reliable` MODE IS DELETED.** §4f–§4h measured it WORST on the exact
> field its structured-output guardrail existed to secure (`hpDelta` 0/12 — a field-routing failure), so the
> delivery axis is now `folded` (born default, hosted champion) + `cheap` (local champion, grammar-bound on
> vLLM). Pre-launch NO-LEGACY: no shim, no deprecation arm. The structured-output VEHICLE survives where it is
> the only one available (the agent-sdk wire's degrade inside `runToolRound`, and the host resync). Every
> measurement below is a historical record and is left exactly as taken — the probe harness keeps the arm under
> the name `structured`.
>
> **RESUME HERE.** Status 2026-07-30: **R1 is the decision and it is settled.** Read in this order —
> §4c (the "two gaps" were a test artifact; R4/R4a withdrawn) → §4d/§4d-bis (**the top open item: a
> one-line reminder fix, R4b**) → §4e (genre openness + the journal-type door, R4c). §4/§4a are retained
> for methodology only; several of their conclusions are superseded IN PLACE, so don't quote them without
> reading the banner above each. R1–R3, R5, R6 stand unchanged.
>
> **NEW 2026-07-31 — read §4f + §4g before touching the local-8B question.** §4f: the three vehicles are three
> different ENFORCEMENT classes on our vLLM wire — `reliable` and `cheap` are grammar-bound, **`folded` is not**
> (`tool_choice:"auto"` compiles no grammar), so R5a/R6/establish-when-unset do NOT bind on the folded path.
> §4g (LIVE, 3 runs × 3 arms): **`folded` emits ZERO narrative on the 8B — 36/36 turns** (tool calls only), so
> it is disqualified on this backend; and **`reliable` — the mode R3 kept for the 8B — measured WORST**
> (`hpDelta` 0/12, `removeCondition` 2/15) while `cheap` leads. R3's premise is contradicted by measurement.
>
> **NEW 2026-07-31 — §4h answers F2 and it is a PRODUCT DEFECT, not a prompt question.** Sonnet emits a card
> on 95% of opportunities; our tokenizer renders 73%. The gap is a stray `>` on the open fence
> (`:::card title="…">`) that `parseFenceAttrs` rejects outright, dropping the whole card — and once the
> malformed line is in history the model imitates it for the rest of the session. No teach copy fixes it;
> the fix is fence-open leniency in `packages/kit/src/content/index.ts`.
>
> This doc + the harnesses under `scripts/probes/rpg-extraction/` ARE committed; the result dirs and flat
> transcript JSONs are gitignored, so the analysis survives only in this file.

---

## TL;DR — the decision

1. **Fold state extraction into the narrative turn** for hosted strong models: one `chat.send` with the
   **GM persona prompt + the existing 7 rpg tools + `tool_choice:"auto"`**, keeping BOTH the message
   `content` (narrative) and the `tool_calls` (state). This replaces today's *two* model calls (narrative
   turn + separate post-commit state round) with **one**. Verified: Sonnet 5 co-emits a full narrative AND
   1–3 strict-validated tool calls in a single completion on **6/6** turns. **~43% cheaper, ~34% faster.**
2. **No schema work.** The 7 tools are already the per-plane split of the state; the fold is a **wiring
   change**, not a schema change.
3. **Ship enriched tool descriptions + a state-tracking guide.** An A/B proved terse descriptions cause
   the model to skip rich fields (NPC appearance/outfit, relationship, plot, journal titles); adding
   when-to-use examples lifted coverage **33→37/43 distinct fields, +27 field-writes**, for +$0.008/game.
4. **There is NO `removeCondition` bug and NO `hpDelta` bug — §4's "two gaps" were a test artifact**
   (§4c, 2026-07-30). A 12-turn game scripted with five *unambiguous* retirements gets **5/5 recall in six
   of six runs** and `hpDelta` **4/4 in six of six**, with thinking **off**. The original 0/8 measured a
   game that never clearly ends a condition, scored per-turn instead of per-opportunity (§4b). **R4 and R4a
   are withdrawn**; no effort change, write-surface redesign, or reconcile step is needed. (Incidental:
   `low` effort measured *cheaper* than `none` — $0.197 vs $0.233 on ~7 fewer tool calls — so switching is
   defensible on cost, just not on correctness.)
5. **Tools + a response schema compose only across two rounds** (§2, measured 2026-07-30) — in one call you
   get the tool call and empty text (the turn is unfinished, `stop_reason: "tool_use"`); feeding the
   `tool_result` back yields a schema-valid narrative on round 2. So **"enforced prose + enforced state" is
   unreachable for a one-call TERMINAL-tool fold** — a property of our shape, not of the API — while a
   2-call variant no §3 arm measured could have both. Cost decides it, not capability.
6. **The OR shim under-drives `effort` 3–6× vs the native wire** (§4a) — OR's `high` yields less thinking
   than native's `medium`. Every effort-based statement in this doc is scoped to OpenRouter, not to
   Anthropic. Tracked as F5.
7. **The state DOES steer the story — but only a GLOSSED number does, and we currently ship bare ones**
   (§4d/§4d-bis, 2026-07-30). Silently decaying a tracked NPC meter 95→10 with no instruction moved the
   character's portrayal by **−0.12** as a bare number (noise) and **−1.00 mean / −2.33 last-3** with a
   one-clause gloss, monotonically. 🐞 **`castFieldSegs` (`substrate/reminder.ts:182`) drops `field.hint`**
   despite its docstring claiming otherwise, and no other path carries it to the model — so every
   host-defined tracked field is currently decoration rather than a steering lever. **R4b** is the one-line
   fix and the highest value/effort item in this document.
8. **Keep the monolithic `reliable`/structured mode for the local 8B only** — it still compiles under
   xgrammar there and the weak model needs the guardrail. Routing becomes **backend-aware**.

---

## 1. What we have today

Per-turn, `cheap` mode runs **two model calls**:

```
  player action
       │
       ▼
  ┌───────────────────────────┐   CALL #1  (persona prompt · NO tools · big input)
  │ NARRATIVE turn            │ ─────────────────────────────────────►  content = prose  ✅
  └───────────────────────────┘   (committed → player sees it)
       │
       ▼  post-commit, SEPARATE request
  ┌───────────────────────────┐   CALL #2  (extraction prompt · 7 tools · big input RE-SENT)
  │ STATE ROUND (runToolRound)│ ─────────────────────────────────────►  content = ""  (discarded)
  │ tool_choice: REQUIRED     │                                          tool_calls → apply → snapshot
  └───────────────────────────┘
       │
       ▼
  pure snapshot-diff (substrate/delta.ts) renders "CHANGES SINCE LAST BEAT" into NEXT turn's reminder
```

Key seams (server):

- `flushTurn(ctx, game, mode, turn)` — `chat-ops/flush.ts:156`. At `onTurnCompleted`, gated by
  `deriveTrackersReadOnly(mode, capability)` (`:157`), calls `stageStateRound` (`:68`).
- `reliable` → `buildRunExtraction` (structured `response_format: json_schema`);
  `cheap` → `buildRunToolRound` (`entry/compose/rpg.ts:596`) — 7 tools, `tool_choice:"required"`, reads
  **only** `result.toolCalls` (`:623`) → discards any message content.
- The 7 tools: `tools/index.ts` — `update_party`, `update_inventory`, `update_scene`, `set_widget_value`,
  `upsert_quest`, `add_journal_entry`, `no_changes`. Args = `@orb/contracts/rpg` schemas.
- The reminder state-fold + pure diff: `chat-ops/gather.ts` + `substrate/delta.ts` (deterministic, no I/O).

**Cost shape:** the big input prompt is paid **twice per turn** (two calls, different system prompts → no
shared prompt cache). Verified: an isolated tool round = ~6.6k input + ~700 output ≈ **$0.023–0.032**.

**Why we're changing it:** two calls is the sad-path-8B accommodation (owner ruling 2026-07-27: "char turn
is tool-less prose; state captured by its own request"). Hosted strong models don't need the split — and
the separate round's emitted message is *empty* under the extraction prompt (verified), so nothing of value
is lost by collapsing it.

---

## 2. Investigation trail (what we ruled out)

- **"Interleaved thinking" is not reachable on our wire, and is empirically moot for this shape.**
  *Correction to an earlier draft:* interleaved thinking **is** a real API feature — on Anthropic's native
  Messages API, `thinking: {type:"adaptive"}` enables it (it used to need the
  `interleaved-thinking-2025-05-14` beta header). Our wire (`infra/providers`) carries no
  interleaved-thinking support at all because **OpenRouter's
  chat-completions wire doesn't expose Anthropic's `thinking` object at all** — it gives us
  `reasoning: {effort}` and nothing more. So the conclusion stands but the reason is wire scope, not
  non-existence.
  *Second correction:* the docs define it as thinking **"between tool calls within a single assistant
  turn"** — not "≥2 rounds" as an earlier draft said. The distinction is terminology, not substance: an
  assistant turn spans the whole tool loop (several HTTP round trips) and isn't complete until `end_turn`.
  Either way it needs a tool **result** to reflect on, and our extraction tools are terminal — the turn ends
  at the first `tool_use`, so there is nothing to interleave. Confirmed by measurement
  (`native-wire-probe.mjs`): `thinking:{type:"adaptive"}` on a terminal tool turn emitted
  **`thinking_tokens = 0`**. Note that is *also* documented behaviour for the effort level used
  (`low` = "skips thinking for simple tasks"), so it is consistent, not anomalous. See §7a for the
  non-terminal variant, the only shape where this would matter.
- **Our OR path = `client.chat.send`** (OpenAI-compat), which already streams back reasoning + content +
  tool_calls from one completion and we already capture all three (`chat-completions.ts`). Reasoning depth
  there is `effort` only (no token budget — that's the `responses` surface, unused).
- **The monolithic `rpg_state_extraction` json_schema is DEAD on Sonnet 5's strict-grammar path.**
  Anthropic strict caps: 24 optional params / 16 union-type params / internal "grammar too large" ceiling.
  All-required → grammar too large; sparse → 41 optionals > 24-cap. It still compiles on local vLLM/xgrammar
  (4.6 too). **Structured extraction cannot ship on hosted Sonnet without a redesigned lean schema.** Tools
  are unaffected (each tool is a small schema).
- **Owner hard rule:** no "pretty please" formatting (`json_object`/prompt-guidance). Every mechanism must
  be enforced — strict-validated tool args or a strict grammar. This eliminates the `json_object` fallback
  entirely and narrows "guaranteed on hosted" to **tools** or **a lean strict schema**.
- **Tools + a response schema compose — but across TWO rounds, never one.** (Measured 2026-07-30;
  `native-wire-probe.mjs` + `native-format-roundtrip.mjs`, ~$0.03.) Sending `tools` together with a
  response schema in ONE call returns the tool call and **empty text** — `finish_reason: tool_calls` on the
  OR wire, `stop_reason: "tool_use"` on native, with adaptive thinking on *and* off. That is not a dropped
  narrative: **`tool_use` means the turn is unfinished.** Feed the `tool_result` back and round 2 returns
  `stop_reason: "end_turn"` with a **schema-valid narrative** (725 chars, verified). This matches the
  Anthropic docs — the schema applies to the *final text turn*, after the tool loop resolves.

  **Consequence for R1:** a **terminal**-tool fold (tools attached, results never fed back — our design)
  never performs round 2, so it can never obtain enforced prose. That is a property of *our chosen shape*,
  not a ceiling of the API. It still rules the combination out for the one-call fold — but it means
  "enforced narrative + enforced state" IS reachable at 2 calls, which no §3 arm measured (`2call-cheap`
  enforces state only and discards content). See §7a.

  ⚠️ *An earlier revision of this bullet claimed the combination was structurally impossible on both wires.*
  That was wrong — the probe stopped at `stop_reason: "tool_use"` and read "turn not finished" as "prose
  dropped." Corrected here; the empty-text-in-one-call observation itself reproduces on both wires.

**PRIOR ART — `rpg-companion-sillytavern`** (the previous codebase’s `references/`) lands on the SAME axis, which is a
useful independent check on R1's framing: it ships exactly two "Generation Modes" — **Together** (one call)
vs **Separate** (a second call). But its mechanism is **text extraction**: tracker data is emitted *inside*
the prose and regexed out. Its own README lists the inherent cost — *"Tracker formatting mixed in AI
response · May affect roleplay quality slightly."*

**That con is a property of text-extraction, not of one-call.** Our R1 gets Together-mode's economics
without its tax, because `tool_calls` is an **out-of-band channel** from `content`: nothing is embedded in
the prose, nothing is parsed back out, and the args are strict-validated rather than regexed (§3 measured
1014 chars of clean narrative alongside the tool call). It is also the same "pretty please" formatting the
owner's hard rule bans (§2). So: same decision axis, strictly better mechanism — and the quality tradeoff
they document is one we don't have to make.

---

## 3. Spike 1 — method matrix (which mechanism wins)

One fixed 6-turn game, every candidate method, `anthropic/claude-sonnet-5`. All mechanisms **enforced**.

| Method | Cost | Latency | Narrative | Cards | State health |
| - | - | - | - | - | - |
| 2call-strict-lean *(structured)* | $0.113 | 92s | ✅ 6/6 | 0/6 | ⚠️ stale-overwrites |
| 2call-cheap *(today)* | $0.131 | 91s | ✅ 6/6 | 1/6 | ✅ sparse |
| **① 1call-tools** | **$0.075** | **60s** | **✅ 6/6** | 0/6 | ✅ **0 dropped** |
| 1call-tools+reasoning | $0.102 | 95s | ✅ 6/6 | 0/6 | ✅ (no payoff) |
| 1call-wrapper-strict | $0.059 | 75s | ⚠️ 5/6 | 0/6 | ⚠️ overwrites |
| 1call-wrapper+reasoning | $0.101 | 248s | ⚠️ 5/6 | 0/6 | ⚠️ |
| 1call-tools-required | $0.041 | 22s | ❌ 0/6 | 0/6 | — |

**Winner: `1call-tools`.** Verified independently on the raw wire — all 6 turns returned narrative
(631–1334 chars) **and** 1–3 tool calls in one completion (`finish_reason: tool_calls`).

Why tools beat structured/wrapper (not just cheaper):

- Structured schema is dead on Sonnet 5 (§2).
- **Full-snapshot structured stale-overwrites**: re-emitting full state each turn made the model *drop*
  carry-over — worst case wiped both starting items AND both NPCs in one turn. Its higher "completeness"
  is an artifact of re-emitting all planes, not better tracking. Sparse tool-deltas never clobbered.
- **The strict wrapper can emit valid JSON with an empty narrative** — silent prose failure.
- **Reasoning is a latency trap** (248s/6 turns, no quality gain). ⚠️ **Re-labelled by §4a:** that arm ran
  OR-`high`, which delivers ~297 thinking tokens — *below* native-`medium`. It shows a small amount of
  thinking costing a lot of latency on this wire, **not** that high effort fails to pay.
- **`tool_choice:"required"` kills prose** (0/6). Must be `auto`.

**Caveat:** immersive `:::card` was rare across ALL methods (0/6 for the winner). Reads as a prompt/seed
artifact of the spike, not a tools regression — but card frequency needs its own look (§7).

---

## 4. Spike 2 — field coverage (terse vs enriched descriptions, A/B)

8-turn game written to invite every field; Arm A = current terse tool descriptions, Arm B = enriched
"when-to-use + example" descriptions + a state-tracking guide. 16 calls, **$0.29 total**.

**Enrichment materially helped** (verified tallies, /8 turns):

| field | A | B |
| - | - | - |
| party.status | 1 | 5 |
| present.emoji | 0 | 3 |
| present.outfit | 1 | 3 |
| present.customFields (trust/role) | 3 | 6 |
| present.relationship | 4 | 7 |
| plot.actSummary | 0 | 2 |
| journal.title | 0 | 5 |

Distinct fields ever populated **33→37/43**; total field-writes **101→128 (+27)**; rescued 5 fields Arm A
never touched; **+$0.008/game**. The lifted fields are exactly the "rich" ones the owner flagged as chronically empty.

> ## ⛔ SUPERSEDED — the "two gaps" below are a TEST ARTIFACT, not a model defect. See §4c.
>
> A 12-turn game scripted with five *unambiguous* condition retirements gets **5/5 recall in six of six
> runs**, and `hpDelta` **4/4 in six of six** — with thinking OFF. "The Sanctified Map" simply never clearly
> ends a condition, so §4 measured the game, not the model. Everything in §4a/§4a-bis that chases a fix for
> these gaps is chasing a bug that does not exist; it is retained for the methodology lessons only.

**Two gaps enrichment could NOT fix (structural):**

- **`removeCondition` = 0/8 in BOTH arms.** The model adds conditions but never retires them — even on the
  turn that explicitly stops the bleeding, even though Arm B's guide says "removeCondition when it ends."
  Conditions accumulate forever. **Prose can't fix subtractive bookkeeping.**
- **`hpDelta` inconsistent** (2/8 → 1/8). Narrates the wound, doesn't reliably emit the number.

### 4a. Spike 3 — the reasoning ladder vs `removeCondition` (2026-07-30) · verdict in §4a-bis

Spikes 1–2 measured only the **ends** of the effort ladder (`none` everywhere; `high` on two arms of §3).
`low`/`medium`/`xhigh` were never run. Arm B (enriched), same fixed 8-turn game, tools and descriptions
held constant — only `reasoning.effort` varies. `none` was run **twice** as a variance control:

| run | cost | latency | tool calls | fields touched | `removeCondition` | `hpDelta` |
| - | - | - | - | - | - | - |
| `none` (orig 07-29) | $0.149 | 119.5s | 29 | 37/43 | **0**/8ᵗ | 1 |
| `none` (re-run) | $0.158 | 127.2s | 30 | 38/43 | **0**/5 | 2 |
| **`low`** | **$0.152** | 125.5s | 28 | 38/43 | **1**/5 | 2 |
| `medium` | $0.178 | 147.5s | 32 | 38/43 | **1**/8ᵗ | 2 |

ᵗ turns denominator (predates the opportunity counting in §4b).

**⚠️ Most of this table is noise — read only the `removeCondition` column.** The two `none` runs are the
same configuration, and **15 of 43 fields differ between them** (`presentUpsert.customFields` 6→8, `mood`
7→8, `appearance` 3→4, `plot.act` 2→3, `hpDelta` 1→2, …), along with cost ($0.149→$0.158) and tool calls
(29→30). So the "fields touched" column, the `hpDelta` column, and any single-field delta of ±1–2 across
arms are **within run-to-run variance and prove nothing**. An earlier draft of this section claimed a broad
coverage lift from `medium`; the variance control retracts that.

**What survives the control:** `removeCondition` is **0 in both `none` runs and 1 in both `low` and
`medium`**. That's the only column where the arms separate cleanly and the control reproduces.

**And the denominator matters.** `addCondition` fires twice all game and the story ends exactly one effect,
so `removeCondition`'s true ceiling here is ~1 — "0/8" was never a rate. The decisive comparison is the same
fixed turn 6 ("*I press a cloth to the wound to stop the bleeding…*"):

| | emitted |
| - | - |
| `effort: none` | `status: "shallow cut across the ribs, bleeding slowed, steadied by draught"` — **no `removeCondition`, no `hpDelta`** |
| `effort: medium` | `removeCondition: "Bleeding"` · `hpDelta: +2` · `poolDeltas: Stamina +3` · status line |

**Diagnosis — this is FIELD ROUTING, not attention or knowledge.** The baseline *knew* the bleeding
stopped; it wrote it down. It routed the fact into the free-text `status` string instead of the structured
`removeCondition` field, satisfied its own "I recorded that" bar, and moved on. That is exactly why §4's
enrichment failed: a better description tells the model *when* to retire a condition, but does nothing about
`status` being an always-available slot that absorbs the same information at lower effort. Deliberation is
what makes it pay the structured field.

**Economics — `low` is effectively FREE.** At $0.152 it sits between the two `none` runs ($0.149 / $0.158),
i.e. inside the noise band, with the same latency and *fewer* tool calls — and it flips `removeCondition`
just as `medium` does. `medium` costs ~+15% over the `none` mean for no measured benefit beyond what `low`
already gives. **Take `low`.** Scaled to the 6-turn game that keeps `1call-tools` at ~$0.076 vs today's
`2call-cheap` $0.131 — the §3 win is untouched.

**Mechanism confirmed — `low` really does deliberate** (`effort-reasoning-probe.mjs`, GM prompt + the 7 real
tools, single turn). `run-coverage.mjs` did not record `reasoning_tokens`, so §4a originally *inferred*
deliberation from the request parameter. Measured on our actual workload shape:

| `reasoning.effort` | `reasoning_tokens` | returned reasoning text |
| - | - | - |
| `none` | **0** | none |
| `low` | 53–78 | 208–306 chars |
| `medium` | 57–72 | 222–287 chars |
| `high` | 64–145 | 253–572 chars |

So `none` is genuinely thinking-**off** and `low` is genuinely thinking-**on** — the ladder works on the OR
wire. `usageOf` now records `reasoning_tokens` so future runs carry this evidence.

**❌ But per-turn deliberation is NOT the mechanism — that hypothesis is disproven.** Once
`reasoning_tokens` were recorded through a full 8-turn run, the correlation failed:

| run | fired on | `reasoning_tokens` that turn |
| - | - | - |
| `low` (no nudge) | **turn 8** | not recorded |
| `low` + reconcile nudge | **turn 6** | **0** |
| `medium` | turn 6 | not recorded |

The retirement fires on a **different turn across runs**, and in the one run where we can see it, the firing
turn spent **zero** reasoning tokens while four *other* turns in the same run thought (114/61/89/53). Whatever
separates `none` from `low`, it is not "the model deliberated on the turn that needed it."

**A hypothesis that does fit** (untested): the docs note *"when thinking is active, a specialized system
prompt is automatically included to support this feature."* Enabling thinking therefore alters the prompt on
**every** turn, including ones where the model spends no reasoning tokens. That would explain a run-level
effect with no turn-level correlation. If true, the lever is a prompt difference, not deliberation — and it
would be far cheaper to reproduce directly.

### ⚠️ The OR shim UNDER-DRIVES effort — every effort finding here is scoped to OR, not to Anthropic

`effort-ladder-native-vs-or.mjs` runs identical messages + identical tools through both wires across the
full ladder (n=1 per cell, `claude-sonnet-5`):

| effort | native `thinking_tokens` | OR `reasoning_tokens` | native ÷ OR |
| - | - | - | - |
| `low` | 122 | 128 | ~1× |
| `medium` | **419** | 108 | **3.9×** |
| `high` | **1858** | 297 | **6.2×** |
| `xhigh` | **2791** | 932 | 3.0× |
| `max` | **6291** | 1863 | 3.4× |

Native spreads **51.6×** in a clean monotonic curve. OpenRouter spreads **17.3×** and is *non-monotonic* at
the bottom (`low` 128 > `medium` 108). The two wires agree only at `low`; above that OR delivers a fraction
of the deliberation for the same nominal setting — **OR's `high` thinks less than native's `medium`.**

Consequences:

1. **§3's "reasoning is a latency trap" is mis-labelled.** That arm ran OR-`high` ≈ 297 thinking tokens —
   below native-`medium`. It measured a small amount of thinking costing a lot of latency, not "high effort
   doesn't pay."
2. **Our `none` → `low` comparison is the one place the wires agree** (both ≈120 tokens), so §4a-bis's
   run-level result isn't distorted by this — but nothing above `low` on this wire means what its name says.
3. **If real deliberation is ever the goal, OR may not be able to deliver it.** Reaching native-`high`
   thinking depth appears impossible through `reasoning: {effort}` at any rung.
4. **OR `max` returned ZERO tool calls** and consumed the entire 8000-token output cap — a real failure mode
   for a tool-dependent path, not just a cost concern.

n=1 per cell, so treat the exact ratios as indicative; the shape (native steep and monotonic, OR shallow and
not) is unambiguous. Tracked as F5.

⚠️ **Workload-shape caveat, learned the hard way:** the same ladder probed on a *toolless* reasoning puzzle
returned `reasoning_tokens = 0` at **every** rung including `xhigh`. Adaptive thinking decides per request,
so a reasoning probe must use the real prompt shape or it measures nothing. Two Sonnet-5 specifics compound
this: thinking is **on by default** (it rejects `"enabled"`, accepts `"disabled"`), and `display` defaults to
`"omitted"`, so thinking blocks can return with empty text while tokens are still billed. Always read
`reasoning_tokens`, never the visible text.

**⚠️ Operational constraint — effort is part of the cache key.** Per the Anthropic docs, *"the resolved
effort value is rendered into the prompt, so changing it between requests invalidates cache breakpoints"* —
the same way a `budget_tokens` change does. Two consequences for R1+R4:

- **Pick one effort per conversation and hold it.** Varying effort per turn (say `high` on combat beats,
  `low` elsewhere) would invalidate the prompt cache on *every* switch — and the cache is what makes the
  folded design cheap in the first place. This is the single biggest way to accidentally undo R1's win.
- Setting effort explicitly to the model's default is equivalent to omitting it and does **not** break the
  cache. Our target (`low`) is not the default (`high`), so it must be set on every request in the
  conversation, uniformly.
- Verify this holds on the OR wire: the doc statement is about Anthropic-native `output_config.effort`; our
  path sends `reasoning: {effort}` through the OpenAI-compat shim, and whether OR renders it identically is
  **unconfirmed**. Fold this into F4's cache check.

### 4a-bis. Where this actually landed — status: UNPROVEN

Six runs of the same 8-turn game, Arm B, varying only reasoning effort and per-message steering:

| run | `removeCondition` | fired on |
| - | - | - |
| `none` (orig) | 0 | — |
| `none` (re-run) | 0/5 | — |
| `none` + "think hard" nudge | 0/5 | — |
| `low` | 1/5 | turn 8 |
| `low` + reconcile nudge | 1/5 | turn 6 (0 reasoning tokens) |
| `medium` | 1 | turn 6 |

**What holds:** a clean run-level split — **0,0,0 with thinking off; 1,1,1 with it on.** Three-and-three is
more than a coin flip and is the reason this line of investigation stays open.

**What does not hold:**

1. *Deliberation as the mechanism* — disproven above (firing turn spent zero reasoning tokens; the firing
   turn moves between runs).
2. *Per-message steering (R4a)* — **tested, no effect.** The "think hard" nudge at `none` changed nothing
   (0/5), and the targeted reconcile nudge at `low` changed nothing (1/5, same as `low` alone). Both fired
   on 5/8 turns. Note the `none` + "think hard" arm was also self-contradictory — asking for deliberation in
   prose while `effort: none` disables it at the parameter — so it tests only that prose cannot re-enable
   what the parameter turned off.
3. *Any single-field reading* — the variance control (§4a) puts 15/43 fields in motion between identical
   runs. A 1-event difference is inside that band.

**Verdict: `low` is a promising candidate, not a fix.** One event per run, no working mechanism, and a
known-large variance floor. **F1 decides it** — a multi-opportunity game with repeats — and until then R4
should not be shipped as settled.

**Correctly sparse (not neglect):** `plot.title` (seeded), `calendarDate`/`day` (no concrete in-fiction
date), `set_widget.items` (Suspicion is scalar), `inventory.remove`/`walletDeltas` (~1 event each). Note
Arm B *correctly* stopped redundantly restating `set_widget.max`.

**Verified bonus catch — ghost characters.** The model treats the `targetRef`/`presentRemove` enum as a
**menu** and emits stale values: it injected **"Aldric Vane"** (a character from the captured template's
game) as a real NPC. In the spike this was a harness artifact (the frozen captured enum), but production
seeds that enum from the live cast — so this **proves the enum is load-bearing**: incomplete seeding or a
mid-add character leaks ghosts into state. Needs a guard.

---

### 4b. Counting fix — conditional fields are scored against OPPORTUNITIES

The original matrix scored every field `n/8` (turns). That is wrong for **subtractive / conditional** fields:
`removeCondition` can only fire on a turn where a condition is actually active. Reporting "0/8" made a field
with a ceiling of ~1 look like a 0% rate, which is what sent §4 hunting for a prose fix.

`run-coverage.mjs` now derives a per-field opportunity denominator from the state **at turn start**:

| field | precondition |
| - | - |
| `update_party.removeCondition` | some actor has ≥1 active condition |
| `update_inventory.remove` | some actor holds ≥1 item |
| `update_scene.presentRemove` | ≥1 character on screen |

Each arm now reports `hits / opportunities` and — the actionable number — **`missed`** (turns the model had
the chance and didn't take it). `coverage.json` carries `denom` + `missed` per field and `opportunity` per
turn; `COVERAGE.md` leads with a conditional-fields block so the `/8` column can't be misread. The raw
`tally` shape is unchanged, so existing readers still work.

**Known limitation, stated in the output:** opportunity is *state-derived*, not *prose-derived* — "was a
condition active at turn start" is a fact; "did the story end it this turn" is a judgement. So the
denominator **over-counts** (a condition can sit active for turns the fiction never resolves), and `missed`
is an upper bound on neglect rather than a defect count. `hpDelta` has no state precondition — any beat may
deal damage — so it is deliberately left on the turns denominator.

Measured effect on the same game: `removeCondition` reads **0/5** at `none` and **1/5** at `low`, instead of
0/8 and 1/8.

### 4c. F1 DECIDED — there is no `removeCondition` bug and no `hpDelta` bug (2026-07-30)

The whole §4 → §4a line rested on games that offered ~1 ambiguous retirement. **"The Ford Road"**
(`SPIKE_GAME=afflictions`) scripts **five explicit retirements** and **four explicit damage beats** across
12 turns, each with per-turn ground truth, so recall is measured against what the fiction actually demanded.
Arm B, three runs per effort level:

| effort | `removeCondition` (scored) | naming-mismatch corrected | `hpDelta` | avg cost | avg tool calls |
| - | - | - | - | - | - |
| `none` | 4/5 · 5/5 · 4/5 | **5/5 · 5/5 · 5/5** | **4/4 · 4/4 · 4/4** | $0.233 | 48 |
| `low` | 5/5 · 5/5 · 5/5 | **5/5 · 5/5 · 5/5** | **4/4 · 4/4 · 4/4** | $0.197 | 41 |

**Both scored "misses" at `none` are scoring artifacts, not model failures.** The harness `ensure`s a
condition by *our* name while the model tracks its *own*: on `f1-none-1` turn 6 it retired
`Feverish Sickness` (the name it gave the marsh illness) rather than our injected `Poisoned`; on `f1-none-3`
turn 9 it retired `Warded Blade` rather than our `Blessed`. In both cases it retired the right concept.

**Conclusions:**

1. **`removeCondition` works — 5/5 in 6/6 runs, thinking OFF.** §4's "the model adds conditions but never
   retires them… prose can't fix subtractive bookkeeping" is **wrong**. It retires reliably when the fiction
   unambiguously ends an effect.
2. **`hpDelta` works — 4/4 in 6/6 runs, both levels.** Not "inconsistent."
3. **Effort makes no difference to either.** The `none`-vs-`low` split in §4a-bis (0,0,0 vs 1,1,1) was a
   single ambiguous event in a game with no real opportunities. **R4 and R4a are withdrawn.**
4. **`low` was CHEAPER, not dearer** — $0.197 vs $0.233, on ~7 fewer tool calls per run. That matches the
   documented behaviour ("lower effort → fewer tool calls"), and it inverts §4a's cost framing.
5. It also **over-fires benignly**: 1–6 extra retirements per run, nearly all legitimate (a full night's
   rest clearing `Winded`, `Bruised Shoulder`, `Twisted Ankle`). Thorough, not wrong — but worth a look if
   the panel should preserve conditions the host set deliberately (interacts with R6 locks).

**Root cause of the whole detour:** the original coverage game never clearly ended a condition, and the
metric counted *turns* rather than *opportunities* (§4b). Together those manufactured a phantom bug that
three spikes then tried to fix. **The methodology fixes (§4b opportunity denominators, ground-truth scoring,
the variance control, recording `reasoning_tokens`) are the durable output of §4a — not its conclusions.**

### 4d. Does the tracked state actually STEER? — yes, but ONLY when glossed (2026-07-30)

Every spike above measured the **write** half of the loop (coverage, retirement recall). None measured the
**read** half — whether state fed back changes what the model narrates. That loop is the entire reason
rpg-lite exists, and it was unverified.

`steer-probe.mjs`: an NPC carries a tracked meter `Wits`, rendered in the reminder exactly like `Trust`.
Three arms, identical system prompt, identical player actions, **nothing anywhere telling the model what
`Wits` means or to play her differently**. Scored by a blind judge that sees one turn's prose with no state,
no arm label and no turn index.

| turn | Wits | HIGH (pinned 95) | DECAY (bare number) | DECAY + gloss |
| - | - | - | - | - |
| 1 | 95 | 8 | 8 | 8 |
| 4 | 55 | 8 | 9 | 8 |
| 6 | 30 | 8 | 8 | 7 |
| 7 | 19 | 8 | 8 | **6** |
| 8 | 10 | 9 | 7 | **5** |
| **mean** | | **8.25** | **8.13** (Δ −0.12) | **7.25** (Δ −1.00) |
| **last-3** | | **8.33** | **7.67** | **6.00** |

The gloss is `(how sharp and quick-thinking she is right now)` — one clause, no instruction.

**A bare number does not steer.** Δ −0.12 across a 95→10 collapse is noise; the arm is flat (8,9,8,9,8,8,8,7).
**A glossed number steers cleanly** and monotonically (8,8,8,8,8,7,6,5), tracking the input.

The prose is unambiguous. At `Wits 95` Wren answers with layered analysis; at `Wits 10` under gloss:

> *"she's trying to summon back the version of herself that had all the answers twenty minutes ago… 'Honestly,
> Kestrel? Right now I couldn't tell you.'… no clever theory forthcoming"*

The model narrated her *losing* her sharpness, unprompted, from a number plus a clause.

### 4d-bis. 🐞 The `hint` never reaches the model — `castFieldSegs` drops it

`rpgCastFieldSchema` carries an optional `hint` (≤120 chars), and `substrate/reminder.ts:180`'s own docstring
claims it is used:

> *"Kind-aware + hint-glossed (the hint rides the label as a `title`-class gloss in the panel; **in the
> reminder it appends inline so the model reads the steering meaning**)"*

**The function body never reads `field.hint`** (`reminder.ts:182`) — only `label`, `max`, `raw`. And it
reaches the model nowhere else: `compose/rpg.ts:370` passes `castFieldKeys` (keys only, as an enum
constraint), and R6's tool-description threading isn't built. **A host-authored cast-field hint is currently
panel-tooltip-only.**

This is inconsistent with its own neighbours, which gloss correctly:

- pools — `reminder.ts:127` → `Stamina 9/14 (wind you spend pushing on)`
- relationships — `reminder.ts:172` → `vassal (sworn to serve but resentful)`

§4d measures the cost of the omission exactly: **every host-defined cast field is currently the −0.12 arm
when it could be the −1.00 arm.** For a product whose purpose is steering, that is the highest
value-per-line fix on the board — one `field.hint` interpolation, mirroring the pool line directly above it.

**Caveats:** n=1 per arm, single judge, one field, toolless (the read path isolated from the write path).
The monotonic trajectory plus the qualitative prose is the strength here, not the sample size. Also note the
`Wits 10` turn leaked a state reference into prose (*"HP fine but something else worn thin"*) — the probe's
system prompt omits the production template's never-recite-numbers instruction, so that is a harness
artifact, but it shows steering signal can surface as meta-reference if unguarded.

### 4e. Genre openness — the customization surface, and its one closed door

Lite's shape is right for a **steering overlay**: `MODE_POLICY.lite` sets every ENGINE axis false
(`checks`/`encounters`/`maps`/`loot`/`npcs`/`morale`/`perception`/`clocks`/`timeWeather`) and only the DATA
planes true (`quests`/`journal`). `statProfile` defaults to `freeform` ("the sheet renders nothing
mechanical, the model steers on prose"), `prompt: "injection"`, `dateMode: "narrated"`. No dice, no GM
machinery — story steering only.

**Genuinely open, and enough to carry a very different (or spicier) game:**
`features.castFields` (host-defined per-game tracked fields, `text|meter`, with a `hint`) ·
`RPG_RELATIONSHIP_KINDS` has an explicit `custom` escape with a free `label` + host gloss — the model can
never emit off-vocab but can reach *anything* · `statProfile.attributes` (≤12, label+hint) · pools are
name-addressed (D86) so custom resources need no schema change · `lite.steeringNote` (500 chars,
always-wins) · `deception`/`omniscience` · `cyoa` · `userMacros`. Conditions and statuses are free text.

**The one closed door — `RPG_JOURNAL_TYPES`.** `location · npc · combat · quest · item · event · note`,
closed, **with a DB CHECK** (`db/schema/rpg.ts:238,253`) and **no `custom` arm**:

- It is inconsistent with `RPG_RELATIONSHIP_KINDS`, which solved this exact problem deliberately.
- It is combat-flavoured. For romance, intrigue, courtly or slice-of-life play, `combat` is dead weight and
  nearly every beat collapses to `event`/`note` — which makes the journal's own type filter useless in
  precisely the genres lite is best at. `add_journal_entry` fires on **79%** of turns (§4c data), so this is
  a high-traffic plane, not a corner.
- Because it is a CHECK constraint, adding a type is a **migration**, not a config change. Relationships can
  be extended by a host at runtime; journal types cannot be extended at all.

Fix is the shape already shipped once: keep the closed enum, add a `custom` member carrying a free `label`,
and let `config.features` hold per-game hints for host-defined types (so they gloss, per §4d).

### 4f. LOCAL-8B ENFORCEMENT AUDIT — the FOLDED path's tool args are NOT grammar-bound on our vLLM wire (2026-07-31)

> ⚠️ **This section is the STATIC half of an unfinished measurement.** It was opened to carry the
> folded-vs-reliable comparison on the local 8B (3 runs per arm, §4c protocol, the CURRENT surface: R5a
> `7d0e6f60` + R6 grouped schemas + EXT-4 salvage `9b140933`). **That live run did not happen** — the gen
> engine (127.0.0.1:8703, `Qwen/Qwen3-VL-8B-Instruct`) answers `/is_sleeping` → `{"is_sleeping":true}`
> (2.7 GiB/card resident, 0% util, a 90s chat request never returns), and waking it was out of scope for the
> measurement pass. Everything below needs NO model call: it is read off the INSTALLED vLLM source
> (0.22.1, `.cache/vllm/venv`) plus the live engine's argv and `/proc/<pid>/environ`. It stands on its own and
> it changes the R3 question before a single token is spent. **The stale `removeCondition` 0/5 baseline
> (§5/R3's "GROUND-TRUTH RUN vs the 8B") is still un-remeasured.**

**The three delivery vehicles are THREE DIFFERENT ENFORCEMENT CLASSES on this backend — not one mechanism
delivered three ways.** \[\[xgrammar-enforced-schema-is-the-populate-lever]] says the enforced schema, not the
prompt, is what makes the 8B populate. On the folded path that lever is simply **absent**:

| vehicle | what we put on the wire | vLLM 0.22.1 behaviour | args grammar-enforced? |
| - | - | - | - |
| `reliable` | `response_format: {type:"json_schema"}` | `chat_completion/protocol.py:585-588` → `StructuredOutputsParams(json=…)` | **YES** (xgrammar) |
| `cheap` (dedicated round) | tools + `tool_choice:"required"` | `tool_parsers/utils.py:250-251` → `_get_json_schema_from_tools(tools)` → `structured_outputs.json` | **YES** |
| **`folded` (R1)** | tools + `tool_choice:"auto"` | `tool_parsers/utils.py:252-253` — literally `# tool_choice: "auto"` / `return None` | **NO** |

Receipts, all in the installed venv:

- `tool_parsers/utils.py:220-253` — `get_json_schema_from_tools` returns a schema for a **named** choice and
  for `"required"`, and returns `None` for `"auto"`. That is the only tool→grammar producer the generic path
  has.
- `tool_parsers/abstract_tool_parser.py:96-113` — the newer **structural-tag** arm DOES cover `"auto"`, but it
  is double-gated: on `VLLM_ENFORCE_STRICT_TOOL_CALLING` (`envs.py:242`, default `0` — and **absent** from the
  live engine's `/proc/2602322/environ`), and on the parser implementing `get_structural_tag`, whose base
  implementation returns `None` (`:153`). Only two builders are registered at all —
  `deepseek_v4` / `qwen_3_5` (`tool_parsers/structural_tag_registry.py:137,246`), reached by the
  `deepseekv4` and `qwen3coder` parsers. **We run `--tool-call-parser hermes`.**
- `chat_completion/protocol.py:578-607` — the only other producer of `structured_outputs` is `response_format`.
  Nothing else in the package derives a grammar from `tools`.
- Live engine argv: `--enable-auto-tool-choice --tool-call-parser hermes --enable-sleep-mode`, no strict flag.
- Our side: the folded turn attaches `toolChoice: {mode:"auto"}` (`chat/engine/pipeline.ts:513`); the cheap
  round sends `{mode:"required"}` (`entry/compose/rpg.ts:739`).

**So on the local 8B, folded tool args are free-generated `<tool_call>{…}</tool_call>` text that the hermes
parser reads back post-hoc.** Every structural lever the current surface added binds on `reliable`/`cheap` and
**does not bind on `folded`**:

- **R5a's `removeCondition` enum** (the fix minted specifically because the 8B comma-joined four condition
  names into the `{type:"string"}` scalar) — advisory only on the folded path. The prompt half
  (`refEnumerationLines`, "removeCondition must name EXACTLY one of these") is the *entire* defence there, and
  an off-enum value survives generation and dies at `safeParse` — i.e. the write is **dropped**, not corrected.
- **R6's per-actor tracker-key enums** and the locked-tracker pruning — advisory; a write to a tracker the
  actor doesn't carry is representable.
- **ESTABLISH-WHEN-UNSET** (`required` + `presentUpsert.minItems:1`) — this is the lever that was LIVE-PROVEN
  to make the 8B fill a fresh scene at all. Under `auto` it is not enforced, so a fresh folded game on the 8B
  has nothing forcing the scene to establish.

**This reframes the owner's question.** "Can the reliable/cheap modes be deleted?" was being asked as a model-
quality question (does the 8B track state well enough through the fold?). On this backend it is first a
**mechanism** question: `folded` is the only one of the three that hands the weak model an unconstrained
surface, and `cheap` — the two-call vehicle everyone assumed was the sloppy one — is grammar-enforced at the
same token level as `reliable`, per tool, for one extra call. Any live comparison must therefore report three
arms, not two, and must count **enum violations** (an off-enum `removeCondition`, a tracker key the target
doesn't carry) as a first-class column: on `folded` they are expected to be non-zero, and on `reliable`/`cheap`
a non-zero count would mean xgrammar isn't binding what we think it binds.

**Still owed by the live run** (unchanged protocol — 3 runs/arm, `SPIKE_GAME=afflictions`, §4b opportunity
denominators): `removeCondition` recall with the §4c naming-mismatch correction, `hpDelta`, fields-touched
against the CURRENT leaf set (the /43 denominator is stale — pools/widgets/`customFields` are gone, trackers
replaced them), the EXT-4 salvage applied-vs-dropped count per run, narrative co-emission quality, per-turn
latency, and number-recitation into prose. Two harness facts for whoever runs it: `run-coverage.mjs` predates
the tracked-field unification (it still speaks `poolDeltas`/`set_widget_value`/`presentUpsert.customFields`
and carries a half-renamed `state.trackers`/`state.widgets` split), so it must be driven off the real builders
(`constrainExtractionSchema` + `buildRpgToolDescriptions` + `buildTrackerWriteGroups`, all exported from
`@orb/contracts/rpg`) rather than the frozen `real-cheap-toolround.json` capture; and the folded turn carries
**no bookkeeping instruction at all** on a non-reconcile beat (the reminder is deliberately tool-guidance-free,
`substrate/reminder.ts:13`; `FOLDED_RECONCILE_NOTE` fires only on a reconcile), which is itself a candidate
explanation for any under-firing the run measures.

### 4g. THE LIVE THREE-ARM RUN — folded is UNUSABLE on the local 8B (2026-07-31)

The measurement §4f was opened for, now run: `Qwen3-VL-8B-Instruct` on the gen engine, the CURRENT surface
(R5a `7d0e6f60` + R6 grouped per-actor schemas + EXT-4 per-entry salvage `9b140933`), the §4c "Ford Road"
ground-truth game (12 turns, 5 scripted retirements, 4 explicit damage beats), **3 runs per arm, 9 games,
~200 completions, $0**. Harness: `local-8b-vehicles.ts` — it drives the REAL exported builders
(`constrainExtractionSchema` · `buildRpgToolDescriptions` · `composePlaneTeaching` · `buildTrackerWriteGroups`
· the production `buildLiteReminder` · `extractionToStateDelta` · `salvageExtraction`), not the frozen
pre-unification capture `run-coverage.mjs` still speaks. Raw: `scripts/probes/rpg-extraction/` — the run's
own `v2/` capture subtree (its `wire-surface.json` receipt of exactly what the builders hand the model) was
never committed and exists only where the probe ran.

| | **folded** | **cheap** | **reliable** | Sonnet §4c | stale 8B baseline |
| - | - | - | - | - | - |
| calls/turn | 1 | 2 | 2 | 1 | 2 |
| grammar on the args (§4f) | **none** | tool union | full schema | — | — |
| `removeCondition` (opportunity-scored) | **0/15** (0,0,0) | **4/15** (2,2,0) | 2/15 (0,0,2) | **5/5 in 6/6** | 0/5 |
| — spurious retirements | 0 | 5 | 0 | 1–6 | — |
| `hpDelta` on a damage beat | **12/12** (4,4,4) | 9/12 (4,1,4) | **0/12** (0,0,0) | **4/4 in 6/6** | 4/4 |
| distinct fields touched /48 | 32.3 (31,30,36) | 25.3 (29,22,25) | 33.7 (36,32,33) | — | 33/43 (old set) |
| **narrative** | **0 chars — 36/36 turns** | 1658 chars | 2820 chars | 6/6 turns | 589 chars (n=1) |
| enum violations | 0 | 0 | 0 | — | — |
| EXT-4 salvage: dropped / saved turns | 0 / 0 | 0 / 0 | 0 / 0 | — | — |
| number recitation into prose | n/a (no prose) | **32/36 turns** | **36/36 turns** | — | observed |
| latency / turn | **4.8s** | 10.3s | 18.8s | — | — |

**Note the denominator changed.** The old `/43` leaf set died with the tracked-field unification (`poolDeltas`,
`set_widget_value`, `presentUpsert.customFields` are gone; `trackerDeltas`/`trackerSets`/`set_tracker` replaced
them). The current surface is **48 leaves**; `/43` numbers above are not comparable row-for-row.

#### 1. 🔴 The fold's PREMISE fails on this model: it emits NO prose at all

`folded` returned **zero characters of narrative on 36 of 36 turns** — `finish_reason: tool_calls`,
`content: null`, tool calls only. R1's entire value ("keep BOTH the message `content` and the `tool_calls`")
does not exist here. Verified three ways: through the harness on both delivery shapes; and on the **bare raw
wire** with no harness, no reminder and a 1-line system prompt — still `content: None`. In isolation the model
*sometimes* co-emits (2 of 4 single-turn retries produced 419–487 chars), so it is not incapable — but with the
production reminder attached it was **0 for 36**. §5/R3's "the 8B co-emitted a 589-char narrative AND a valid
tool call" was n=1 and does not survive repetition.

The control is inside the same battery: `cheap`/`reliable` run their narrative call with **no tools attached**
and produce 1497–2959 chars every turn. So it is tool-attachment that silences the prose, not the model, the
prompt, or the reminder.

#### 2. `removeCondition` is still broken on the local 8B — and R5a did not fix recall

Best local arm is `cheap` at **4/15**; `reliable` 2/15; `folded` **0/15**. Sonnet gets 5/5 in six of six runs
on this identical game. R5a's enum did exactly what it was minted for — the comma-joined-list-into-a-scalar
failure never recurred, and **enum violations were 0 across all 108 turns** — but *preventing a malformed
retirement is not the same as causing a retirement*. The 8B mostly just doesn't emit one. (`folded`'s 0
violations is NOT evidence of enforcement: there is no grammar on that path (§4f), so it only shows the prompt
half — `refEnumerationLines` — held on these beats.)

#### 3. 🔴 `reliable` never records damage — 0/12, and the receipt says why

The mode kept "for ACCURACY, not capability" (R3) is the ONLY arm that missed **every** damage beat. The raw
args (diagnostic run, `diag/reliable-1.json`) show it is not neglect but **field routing** — the §4a diagnosis,
reappearing on the 8B:

```
t1  (blade opens a gash)  {"targetRef":"player","trackerDeltas":[{"key":"stamina","delta":-2}],"trackerSets":[{"key":"resolve","value":7}]}
t8  (cudgel, shoulder)    {"targetRef":"Rook","trackerDeltas":[{"key":"stamina","delta":-2}],"trackerSets":[{"key":"resolve","value":6}],"addCondition":{"name":"Wounded","modifier":0}}
t11 (ankle, down on rocks){"targetRef":"player","trackerDeltas":[{"key":"stamina","delta":-3}],"trackerSets":[{"key":"resolve","value":3}]}
```

It spends `stamina` and re-reads `resolve` on **every single turn** and omits `hpDelta` — the enforced whole-
object schema makes it fill the tracker arms habitually and skip the optional scalar. (Once, on a NON-damage
beat, it emitted the filler `hpDelta: 0`.) `folded`, with no grammar at all, got **12/12**. That is the
opposite of the R3 premise: on this game the enforcement *hurt* the field it was supposed to protect.

#### 4. EXT-4's salvage never fired — nothing to salvage

Across all 9 runs: **0 dropped tool calls, 0 dropped entries, 0 turns where per-entry salvage saved a turn the
old whole-object parse would have lost.** Every payload the 8B produced conformed. EXT-4a is still correct
insurance (it costs nothing and the failure it fixes was real and measured), but on this model/game it is
currently unexercised — do not cite it as a live benefit.

#### 5. 🐞 Both prose arms recite the panel back at the player, as an HTML stat block

`reliable` recited numbers on **36/36** turns and `cheap` on **32/36**, in flagrant violation of
`RPG_STEERING_LICENSE` ("Never recite the raw numbers back at the player; weave them into the prose"):

> `<p><strong>Player Status:</strong> HP 26/26 — Stamina 14/14 — Resolve 10/10 — Gold 40</p>`

Caveat before this is read as a pure license failure: the run used the **config defaults**, and
`features.immersiveHtml` defaults to `true`, so the reminder carried the card/HTML teaching block. The weak
model read "you may emit HTML" as "render the panel." Two candidate fixes (untested): default
`immersiveHtml` off for weak backends, or harden the license clause. Either way this is a **dogfood-visible
defect on the local path today**, not a spike artifact — and it is invisible on `folded` only because `folded`
writes no prose at all.

#### 6. ✅ RETRACTED — the per-call xgrammar recompile is NOT a measurable cost

An earlier report of mine flagged R5a's per-turn enum (a fresh grammar every call ⇒ a compile cache miss) as a
production perf item. **Measured, and it does not hold at our schema size.** Same request, cold vs warm, on the
live engine: no-schema baseline 748–812ms · schema A cold 866ms / warm 843ms · a novel enum cold 3128ms / warm
3405ms (n=1), 3940/3917 (n=8), 3951/3050 (n=40). The cold-warm delta is inside generation noise (±300ms, and
the owner's dogfood turns were interleaving), nowhere near the ~0.7s §2 cited. The schema constraint costs
roughly **+90ms over no schema at all**. No action; do not carry this forward as a concern.

#### Recommendation — `reliable` does NOT earn its keep for local, and `folded` must never reach the 8B

> **✅ The "`folded` must never reach the 8B" half SHIPPED (2026-08-01, owner-ruled — D112 amendment).** A
> `folded` game on a LOCAL vLLM chat wire withholds the terminal-tool mount PRE-commit and runs the cheap
> post-commit round instead, loud (`rpg.extraction.path` WARN, `fallbackReason: "local-engine-fold-guard"`).
> The wire class arrives as a CAPABILITY fact — `ModelCapability.tools.silencesProse`, set by the `vllm` arm of
> `catalog/resolve-model-capability.ts` and read through `coEmitsProseWithTools` — so `domain/rpg` still never
> branches on `credential.source`. An EXPLICIT host `cheap`/`reliable` is untouched; hosted wires unchanged.
> Not shipped from this section: the routing OPINION (local → `cheap` over `reliable`) and the
> `immersiveHtml`/number-recitation defect (#5) remain open.

On this evidence the routing should be: **local 8B → `cheap`.** It is the only arm that keeps the narrative
AND is grammar-bound (§4f), it wins `removeCondition` (4/15 vs 2 and 0), it is near-perfect on `hpDelta` (9/12
vs reliable's 0), and it costs 10.3s/turn against reliable's 18.8s. `reliable` — the mode R3 kept specifically
because "the weak model needs the guardrail" — measured WORST on the one field its guardrail was supposed to
secure, spends the most tokens (2820-char narratives, 208 applied writes), and is the slowest by 80%; its only
win is a marginal fields-touched edge (33.7 vs 25.3) that mostly reflects it writing the same two tracker arms
every turn. **`folded` is disqualified on this backend outright** — not on state quality (it actually leads on
`hpDelta` and is the fastest by 2×) but because it costs the player the entire story. That is a mechanism
failure, not a tuning gap, and it is the strongest argument in this document for keeping mode routing
backend-aware rather than collapsing to one vehicle. Before any deletion decision: none of this touches hosted
strong models, where §3/§4c's 6/6 co-emission and 5/5 recall still stand.

### 4h. F2 RESOLVED — Sonnet is NOT reluctant to emit cards; it malforms the OPEN FENCE and we eat them (2026-07-31)

F2 asked why `:::card` was rare across every spike method (0/6 for the winner AND 0/6 for the pure narrative
call), on the assumption the model was withholding. **The assumption is wrong. Sonnet emits a card on 95% of
opportunities (114/120). We render 73% (87/120). The other 27 are emitted, eaten by our own tokenizer, and
never reach the reader.**

Harness: `card-teach-probe.ts` — a scripted 10-turn scene in which every player action puts ONE visual
artifact in focus (district sign · taped note · vending screen · receipt · hand-drawn map · terminal login ·
health poster · ID badge · directory plate · ledger page), so the denominator is OPPORTUNITIES (§4b), not
turns. The injection is built by the REAL `buildLiteReminder` (the §4d-bis `steer-probe-real` pattern) with
`features.immersiveHtml: true`, and ONLY the card-teach block is swapped per arm — every other byte is
production. The state deliberately carries recitable numbers (HP 22/30, Stamina 9/14, Corruption 31/100,
Trust 55/100, 48 credits) as §4g#5 bait. Scored twice: `emitted` = a `:::card` line in the raw text;
**`rendered` = a `card` span out of the production tokenizer** (`@orb/kit/content`, `committed: true`).

**The mechanism — one stray character.** The model writes `:::card title="Maintenance Terminal — LOGIN">` —
an HTML-tag reflex closing the opener with `>`. `parseFenceAttrs` returns `null` on any unparseable rest, so
`tryDirectiveFence` rejects the line; the block degrades to an `unknown-directive` span, which the reading
surface **hides**. The player gets the prose and a hole where the card was. Verified against the tokenizer
directly:

| open line | tokenizes as |
| - | - |
| `:::card title="Sign"` | **card** |
| `:::card title="Sign" foo="bar"` (unknown attr) | **card** (version-tolerant, as the header claims) |
| `:::card title="Sign" ` (trailing space) | **card** |
| `:::card` (no title) | **card** |
| `:::card title="Sign">` | text / `unknown-directive` — **DROPPED** |
| `:::card title='Sign'` (single quotes) | text — **DROPPED** |
| ` :::card title="Sign"` (leading space) | text — **DROPPED** |

**It is a cascade, not a coin flip.** The malformed opener lands in the assistant history and the model
imitates itself for the rest of the session. A slip at turn 3 cost eight consecutive cards (A run 1, E run 2);
a slip at turn 6 cost five (G run 2). Recovery happens but is not reliable (A run 2, C, F each slipped and
partly recovered).

**Arms** — one 10-turn run each unless noted; `eaten` = emitted − rendered.

| arm | teach | emitted/opp | RENDERED/opp | eaten | recite | pos | refusal-talk |
| - | - | - | - | - | - | - | - |
| **A** | CURRENT `RPG_CARD_TEACH` (with the anti-recitation tail) | 10/10 · 8/10 | **2/10 · 6/10** | 8 · 2 | 0 | mid | 0 |
| **B** | A minus the anti-recitation tail | 8/10 | 8/10 | 0 | 0 | mid | 0 |
| **C** | stronger invitation ("aim for a card whenever a visual object takes focus") + tail | 10/10 | 8/10 | 2 | 0 | mid | 0 |
| **D** | C + a worked example (a 3-line sign) inline | 10/10 · 10/10 | **10/10 · 10/10** | 0 | 0 | **lead** | 0 |
| **E** | A + a capability-reassurance line ("this client renders your cards natively…") | 9/10 · 10/10 | 9/10 · **2/10** | 0 · 8 | 0 | mid | 0 |
| **F** | the RPG-Companion (ST extension) HTML prompt, minimally adapted to our fence | 9/10 | 7/10 | 2 | 0 | mid | 0 |
| **G** | A + the worked example (permission framing + tail unchanged) | 10/10 · 10/10 | **10/10 · 5/10** | 0 · 5 | 0 | mid | 0 |
| **H** | G + a prose-order clue | 10/10 | 10/10 | 0 | 0 | mid | 0 |

**Findings:**

1. **Reluctance is not the problem.** Every arm emits at 8–10/10, including the shipped copy. The 0/6 that
   opened F2 was almost certainly this same silent drop, not a model that declined.
2. **The anti-recitation tail does NOT suppress emission** (B 8/10 without it vs A 10/10 with it, and B is the
   arm that lost turn 1 and turn 5) — **keep it.**
3. **Recitation is a LOCAL-8B failure, not a hosted one. Zero violations in 120 hosted turns across every arm,
   including the tail-less arm B**, with the bait state visible on every turn. §4g#5's stat-block cards are a
   weak-model behaviour; the tail is cheap insurance for that path, not load-bearing on Sonnet.
4. **The capability-reassurance hypothesis is dead (E).** 9/10 then 10/10 emitted — indistinguishable from
   baseline emission, and its run 2 suffered the worst cascade in the set. Sonnet is not doubting the surface.
5. **The wild-tested RPG-Companion phrasing does not fix it either (F)** — 9/10 emitted, 7/10 rendered, same
   `>` slips at turns 6 and 8. Its near-zero protocol overhead (shortest teach, shortest replies at 1816 avg
   chars) is not the lever; protocol verbosity was never the drag.
6. **The worked example is the best copy available and still not sufficient.** The example arms are the only
   ones with a mechanistic reason to be clean (they pin the exact opener bytes) and they lead the set — but
   G run 2 cascaded from turn 6 anyway. **No copy tested prevents the drift.**
7. **C's expectation framing has a side effect: card-FIRST responses.** D (= C + example) put the card before
   any prose on 10/10 turns; every permission-framed arm kept it mid-prose. The framing, not the example,
   causes it — G (= A + example) is 0/10 lead. H's explicit prose-order clue was therefore unnecessary.
8. Cards never landed at the END of a response in any arm (0/87). Nobody ever explained a refusal — the
   card-less turns simply narrate the artifact in prose (see B t1/t5, E t1; all turn-1 misses, a warm-up
   effect that vanishes once one card is in history).

**Recommendation — the fix is the TOKENIZER, and the copy change is a cheap second layer.**

> **✅ BOTH LAYERS SHIPPED (2026-07-31, F2a+F2b).** The tokenizer arm is `FENCE_OPEN_TAG_CLOSE_RE` in
> `packages/kit/src/content/index.ts` — scoped NARROWER than the prose below on the raw evidence: mining every
> probe transcript for unparseable fence-open rests returned **27/203 lines, all with the identical residue
> `">"`**, and **zero** single-quoted attrs, **zero** leading-space opens, **zero** `/>`. Only the measured
> trailing-`>` class is tolerated (after a well-formed attr list, on a REGISTERED name — `:::choices>` rides
> the same recognizer for free); the single-quote and leading-space arms are NOT shipped, because both would
> loosen the attr grammar / the line anchor rather than the open line's trailing junk. The copy layer is
> `RPG_CARD_TEACH_EXAMPLE` in `domain/rpg/substrate/reminder.ts`, appended to BOTH variants.

`packages/kit/src/content/index.ts` already states the posture this violates: *"Unknown attrs on a fence are
IGNORED, never fatal (version-tolerant, graft #V4)."* A malformed *rest* is fatal today. For a REGISTERED
fence name (`card`/`choices`), an unparseable rest should fall back to best-effort attrs rather than rejecting
the line — recovering the trailing `>`, the single-quoted title, and the leading-space open in one change.
That converts every arm in the table to its `emitted` column: **~95% of opportunities, up from 73%.** (Not
built here — this probe is read-only; it needs its own ticket + tokenizer tests for the three shapes above.)

Copy, second: **keep the current permission framing and the anti-recitation tail, and append the worked
example** (arm G — the smallest delta that measured best). Do NOT take C/D's expectation reframe: it buys no
emission at this ceiling and costs the mid-prose card position. Proposed `RPG_CARD_TEACH` = today's constant
plus, appended verbatim:

```text
(blank line)
For example, a three-line sign is enough:
:::card title="Crossing sign"
<div style="font-family:monospace;text-align:center;padding:14px;border:2px solid #6b5c3e;background:#e9e1cb;color:#3a2f1c;letter-spacing:2px">
  <div>EAST CROSSING</div><div>CLINIC — 2 KM</div><div>NO ENTRY AFTER DARK</div>
</div>
:::
```

i.e. `RPG_CARD_TEACH + "\n\nFor example…"`, the exact string the probe's `EXAMPLE` constant holds. Mirror it
into `RPG_CARD_TEACH_STATIC` minus the JS/animation clause. The example is never echoed as a card — zero
"EAST CROSSING" cards in 40 example-arm turns. **Do not ship the copy change alone** — on its own it moved
10/10 → 5/10 in one of two runs.

**Caveats:** n=1–2 per arm, one model, one scene, one genre; the scene is deliberately card-saturated (10/10
opportunities is not a normal session), so treat the emission rates as a ceiling and the malformation rate
(6 of 12 runs carried ≥1 eaten card) as the durable number. Narrative quality was judged by reading, not by a
judge pass: **no arm degraded it** — the cards are genuinely good (period-correct directory plates, water-
stained receipts, a login screen with a stale session banner) and the prose reacts to them; the example arms
read tightest, C/D the most florid (2565 avg chars vs D/G's ~2000).

Artifacts: `scripts/probes/rpg-extraction/card-teach-probe.ts` (12 arm-runs, $2.16 total). `CARD_DRY=1` prints
each arm's assembled injection without spending; `CARD_SCORE=<transcript.json>` re-scores a saved run for free.
Raw transcripts `card-teach-out{,-run2,-run3,-run4}.json` are on disk and gitignored, like the other spike
outputs; the sampled cards are in `CARD-TEACH-SAMPLES.md`.

## 5. Recommendations (prioritized)

> **✅ R1 SHIPPED (2026-07-31).** Landed as a THIRD `extractionMode` member, `folded` (not a capability-derived
> refinement of `cheap` — the honest-arms discipline wants the host's deliberate lever, and R3 scopes the fold
> to hosted strong models, which no capability flag distinguishes from the local 8B). `cheap`/`reliable` are
> byte-unchanged. Seams: the gather mounts the round's OWN `buildToolRoundWireTools` product as TERMINAL tools
> (a new chat-side `terminalTools` channel — attached `tool_choice:"auto"`, never resolved/executed/recursed on,
> never persisted as `ToolCallRecord`s); the completion's calls ride `RpgTurnContext.terminalToolCalls` into the
> flush, which folds them through the SAME `toolCallsToExtraction` → `extractionToStateDelta` path. `null` on
> that channel = the connection could not carry wire tools (the stateful agent-sdk arm) ⇒ fall back to `cheap`'s
> post-commit round, LOGGED (`rpg.extraction.path`). Degrade is total: malformed args drop + log
> (`rpg.extraction.unparseable` with the tool names), ghosts drop (`rpg.extraction.phantom`), zero calls is a
> quiet beat with its own line (`rpg.extraction.folded.quiet`). Freshness corrected in the same pass: `cheap`
> claimed "Live" from D108's dead inline-tools shape — only `folded` is live at commit.

**R1 — Adopt `1call-tools` for hosted strong models.** Narrative turn runs with the 7 tools attached,
`tool_choice:"auto"`, GM persona prompt; keep `content` as narrative + `tool_calls` as state; **drop the
separate post-commit state round** on this path. No reasoning.

**R2 — Ship enriched tool descriptions + the state-tracking guide** (Appendix A). Cheap, fixes the
rich-field class. Applies to BOTH the folded path and any surviving tool round.

**R3 — Keep `reliable`/structured for the local 8B — but for ACCURACY, not capability (revised 2026-07-30).**
⚠️ The premise that the 8B *can't* do the fold was never tested. It was, live: `Qwen3-VL-8B-Instruct` on the
gen engine (port 8703, spawned with `--enable-auto-tool-choice --tool-call-parser hermes`) **co-emitted a
589-char narrative AND a valid `update_party` tool call in one completion**, `finish_reason: tool_calls`,
`tool_choice:"auto"`. So the R1 shape is **mechanically available on the 8B**.
What it got wrong was the semantics: on a beat that *ends* the bleeding it emitted
`addCondition:{name:"Bleeding"}` — the subtractive case **inverted** (the exact failure §4c proved is NOT
real on Sonnet; on the 8B it is). It also recited numbers into prose ("Your HP is now 20/30"). n=1, and the
probe omitted the production never-recite-numbers trailing instruction, so treat the second as harness noise
and the first as signal.
**Consequence:** R3 stands, but the reason changes — and note a full-snapshot structured round would NOT fix
an inverted condition either (the model just writes the wrong snapshot). If the 8B path is ever revisited,
the question is accuracy scaffolding, not tool-calling capability. Original text follows:

**➤ GROUND-TRUTH RUN vs the 8B (2026-07-30, `vllm-1/`, afflictions game, 12 turns, $0):**
`removeCondition` **0/5** · `hpDelta` **4/4** · 33/43 fields (Sonnet: 5/5 · 4/4 · 38/43). But the failure is
**schema misuse, not comprehension**: on turn 12 it emitted
`removeCondition: "Bleeding, Poisoned, Exhausted, Lamed"` — a comma-joined LIST into a `{type:"string"}`
scalar. Semantically correct (a full night's rest clears all four); structurally invalid, and the hermes
parser accepts it because it *is* a valid string. On the individual retirement beats (t3/t6/t9) it emitted
nothing at all. `hpDelta` was perfect, so this is not uniform weakness.
**➤ ACTIONABLE, and it helps BOTH backends:** `constrainExtractionSchema` already binds live enums for
`targetRef`/`widgetRef`. **Bind `removeCondition` to an enum of the currently-active condition names** the
same way. That makes the list-in-a-scalar unrepresentable under xgrammar on the 8B, and is free defence on
hosted. This is a better lever than the whole §4a effort detour and was invisible until a ground-truth game
existed. Tracked as **R5a**.

**R3 (original) — Keep `reliable`/structured (monolith) for the local 8B only.** It compiles under xgrammar and the
weak model needs enforcement. Routing becomes **backend-aware**: hosted strong → 1call-tools; local 8B →
existing reliable round. (`deriveTrackersReadOnly` / the mode branch is where this decision already lives.)

**R4 — WITHDRAWN. There is no `removeCondition` bug.** §4c: five scripted retirements, six runs, **5/5
recall every time with thinking OFF, and `hpDelta` 4/4 every time.** The gap §4 reported was an artifact of
a game that never unambiguously ended a condition, compounded by a turns-based denominator (§4b). No effort
change, no write-surface redesign, and no reconcile step is needed. Keep `reasoning.effort: "none"` unless
something else argues for a change — though note §4c measured `low` as *cheaper* ($0.197 vs $0.233, ~7 fewer
tool calls/run), so a cost-motivated switch to `low` is defensible on its own terms.

**R4a — WITHDRAWN.** Tested (16 calls, ~$0.30) and had no effect at either effort level — and §4c then
showed there was no defect for it to fix. The `SPIKE_NUDGE` machinery stays in the harness; build nothing
on it.

> **✅ R4b SHIPPED + LIVE-VERIFIED (2026-07-31, commit `7604bd6f`).** `castFieldSegs` now glosses both
> kinds; `steer-probe-real.ts` re-ran the §4d probe through the REAL `buildLiteReminder` (whole
> pipeline, production cast line): mean Δ **−1.13** / last-3 Δ **−2.33** vs the pinned arm — §4d's
> hand-rolled numbers (−1.00 / −2.33) reproduce on the production path. Wits-10 turn judged 3/10.
> Results: `steer-real-out.json` ($0.18).

**R4b — SHIP THE CAST-FIELD HINT INTO THE REMINDER. One line, highest value/effort ratio here.** §4d-bis:
`castFieldSegs` (`substrate/reminder.ts:182`) drops `field.hint` despite its own docstring saying it appends
it, and no other path carries it to the model. §4d measures what that costs: a bare tracked number moves
narration by **−0.12** (noise) where a glossed one moves it by **−1.00** (mean) / **−2.33** (last-3),
monotonically. Mirror the pool gloss two functions above it:

```ts
const base = field.max !== undefined ? `${field.label} ${raw}/${field.max}` : `${field.label} ${raw}`;
segs.push(field.hint ? `${base} (${field.hint})` : base);
```

Then re-run `steer-probe.mjs` against the real reminder to confirm the production path reproduces §4d.
This is the difference between host-defined tracked fields **steering the story** and merely **decorating
the panel** — i.e. between lite doing its job and not.

**R4c — Give `RPG_JOURNAL_TYPES` a `custom` escape (§4e).** Closed enum + DB CHECK + no escape, on a plane
that fires on 79% of turns, in a product whose best genres aren't combat. Mirror the relationship design:
keep the enum, add `custom` with a free `label`, hold per-game hints in `config.features` so host-defined
types gloss (§4d). Needs a migration for the CHECK — which is precisely why it should be decided before
more games accumulate rows, not after.

**R5 — Harden the cast enum.** Keep `targetRef`/`presentRemove` enums seeded from the LIVE roster (prod
already does via `resolveExtractionRefs`), and add a **ghost-actor guard**: reject/drop tool args naming
actors not in the current cast, with a test.

**R6 — Per-game dynamic tool assembly + lock/toggle gating of the WRITE surface** (see §6a). The tools,
descriptions, and prompt are a per-game ASSEMBLY from config (custom casts/pools/cast-fields/widgets + their
host-authored descriptions) gated by enabled/locked state. The enriched descriptions (Appendix A) are
TEMPLATES that interpolate the game's custom definitions — not static ship strings.

---

## 6. Changes against what we have (seam-level)

**This is a wiring change, not a schema change. The 7 tools, their arg schemas, and the `apply` path
(`toolCallsToExtraction` → `extractionToStateDelta` → snapshot) are REUSED verbatim.**

| Area | Today | Proposed |
| - | - | - |
| Calls/turn (hosted) | 2 (narrative + state round) | **1** (narrative WITH tools) |
| Narrative turn | persona prompt, **no tools** | persona prompt **+ 7 tools, `tool_choice:auto`** |
| State capture | separate `runToolRound`, `required`, content discarded | **read `tool_calls` off the narrative completion**; keep `content` as the narrative |
| Post-commit round (hosted) | always runs | **removed** for the tools-capable hosted path |
| Tool descriptions | terse | **enriched + tracking guide** (Appendix A) |
| `removeCondition`/`hpDelta` | unreliable | structural fix (R4, follow-up) |
| Cast enum | live-seeded | live-seeded **+ ghost-actor guard** |
| Local 8B path | reliable/structured round | **unchanged** |
| Reminder pure-diff (`substrate/delta.ts`) | deterministic app code | **unchanged** — still diffs prev→new snapshot; the tool_calls ARE the sparse delta |

**Unchanged / preserved:** the pure snapshot-diff and "CHANGES SINCE LAST BEAT" reminder (it's
source-agnostic — folded tool_calls apply to a snapshot exactly like a separate round did, and it still
catches host hand-edits); the `apply`/staging/flush persistence; swipe-consistency; the member-strip and
consent seams (the folded call inherits the character turn's connection + consent, same as the round did).

**Build-time confirmations (flagged, not yet verified):**

- The narrative-turn executor path must surface `tool_calls` to the flush (today only the state round
  reads them). Confirm where the character turn's completion is handled and thread the tool_calls into
  `stageStateRound`'s delta instead of firing a second round.
- Graceful degrade: today a failed round can't lose the narrative (post-commit). Folded, a malformed tool
  arg must NOT fail the turn — commit the narrative, treat tool failures as errors-as-data (mirror the
  existing empty-delta drop).
- Backend-aware gate: where `deriveTrackersReadOnly` / the mode branch decides, add the hosted-strong →
  fold vs local-8B → round split.

---

## 6a. Per-game dynamic tool assembly & lock/toggle gating (REQUIRED)

**The spike used the STATIC captured tools — real games are NOT static.** Users define custom casts, pools,
cast-fields, widgets, and relationship kinds, each with host-authored descriptions, and toggle/lock what the
model may touch. The tool schema + descriptions + prompt must be a **per-game assembly** driven by config.

**What production already does (reuse):**

- Tool **args** are per-game constrained: `buildToolRoundWireTools` → `constrainExtractionSchema(…, refs)`
  injects the live cast/pool/widget enums (this is why the frozen-enum spike leaked "Aldric Vane").
- Custom-plane **teaching** is dynamic: `composePlaneTeaching(config, refs)` folds widgets/customFields/plot
  into the system prompt.
- **Locks are honored defensively at apply:** `staging.stage` (service.ts:139) strips a tool-authored write
  to a locked field AFTER the model emits it.

**What the build must add:**

1. **Read-surface vs write-surface split.** The reminder (read context) ALWAYS shows the full state —
   including locked stats — so the model can narrate around them. The tools (write surface) expose only the
   **writable** subset: a **locked** field is REMOVED from the tool schema; a **disabled** feature's tool is
   omitted entirely. Prevent-at-schema, not just strip-at-apply — so the model never spends attention trying
   to write what it can't, and the defensive apply-time strip becomes a backstop, not the primary gate.
2. **Dynamic enriched descriptions.** Appendix A's strings are TEMPLATES. The real tool descriptions +
   teaching must interpolate the game's custom definitions AND their host-authored descriptions — e.g. a
   custom pool `Grit ("resolve you spend to push through danger")` appears in `update_party`'s poolDeltas
   guidance by name and gloss, a custom cast-field / widget likewise. A locked or disabled definition is
   simply absent from the writable surface (but still shown in the reminder).
3. **Custom cast/pool/widget descriptions flow into the write-surface guidance**, not just the read
   reminder — so the model knows WHEN to move a host-defined pool/field, the same way the enrichment fixed
   the built-in rich fields (§4).

**Principle:** the reminder is the model's *knowledge*; the tools are its *permissions*. Config (custom
defs + their descriptions + enabled/locked flags) drives both — the reminder gets everything, the tools get
only what's enabled-and-unlocked, each carrying its host-authored description.

**Build check:** confirm whether `mode.tools` / the feature toggles (`contracts/rpg/mode.ts`) and the lock
flags already gate `buildToolRoundWireTools` (they gate apply today; they must also gate the schema), and
that custom-def descriptions are threaded into the per-tool description, not only the plane teaching.

## 7. Open questions / follow-ups

- **F1 — ANSWERED (§4c).** No `removeCondition` defect exists: 5/5 in six of six runs on a game with five
  explicit retirements, thinking off. Closed.

- **F1b — ANSWERED (§4c).** `hpDelta` fired 4/4 on every explicit damage beat in all six runs, at both
  effort levels. No defect. Closed.

- **F1c — every §4 single-field delta needs re-reading against the variance floor.** The §4a control showed
  15/43 fields moving between two identical runs, so the §4 A/B table's ±1–2 rows (`plot.actSummary` 0→2,
  `emoji` 0→3, `party.status` 1→5, …) may be partly noise. The *aggregate* (33→37 distinct, +27 writes) is
  more robust than any single row, and `title` 0→5 / `customFields` 3→6 are large enough to likely survive —
  but the small rows shouldn't be quoted individually without repeats. Cheap fix: run each arm 3× and report
  medians.

- **F2 — immersive cards:** card emission was rare across all methods in the spike. Separate investigation:
  is it the prompt, the seed, or does attaching tools suppress the card? (M3 = 0/6, but so was the pure
  narrative call — points at prompt/seed, not tools.)

- **F3 — hosted structured, if ever wanted:** would require authoring a lean all-required, union-free
  schema that compiles under Anthropic's strict caps. Not needed while tools win; documented so nobody
  re-discovers the "grammar too large" wall.

- **F5 — how does OpenRouter translate `reasoning: {effort}`, and can real effort be reached at all?**
  §4a measured OR delivering 3–6× less thinking than native at the same nominal level (`high`: 297 vs 1858
  tokens). Worth establishing: does OR map effort onto a `budget_tokens` fraction of `max_tokens` (which
  Sonnet 5 rejects as `thinking.type.enabled`, so it would have to be doing something else), or onto
  adaptive + a compressed effort? Two things to try: raising `max_tokens` (if OR derives a budget from it,
  the ladder should scale with it), and OpenRouter's `reasoning: {max_tokens: N}` form instead of `effort`.
  If neither reaches native depth, then **any recommendation that depends on deliberation is capped by the
  wire** — which is a genuine argument for the Anthropic skin that §7a currently dismisses. Re-open §7a's
  "not pursued" entry on native migration if this lands.

- **F4a — does an `effort` change invalidate the prompt cache on the OR wire?** Anthropic documents that
  the resolved effort value is rendered into the prompt and that changing it busts cache breakpoints. Our
  path sends `reasoning: {effort}` through OpenRouter's OpenAI-compat shim — whether that behaves the same
  is unverified, and it decides whether per-turn effort variation is merely inadvisable or actively
  ruinous. Cheap to measure: two requests with an identical cached prefix, differing only in effort, and
  read `cache_read_input_tokens` on the second (the §4a runs already pin `cache_control` on the system
  block).

- **F4 — cost of enrichment at scale:** +$0.008/game is trivial, but the enriched descriptions add input
  tokens every turn; confirm the prompt-cache prefix still holds.

---

## 7a. Deliberately NOT pursued (branches ruled out, not overlooked)

Recorded so a future reader can tell "we decided against this" from "nobody thought of it."

- **Non-terminal tools / a reconcile round — the strongest unevaluated option.** Feed the `tool_result`
  back and take a second turn. §2's round-trip probe shows this is the shape that unlocks **both** enforced
  surfaces at once: round 1 gives strict-validated tool args (state), round 2 gives a schema-valid
  narrative. It is also the only shape where interleaved thinking has anything to interleave between, and
  the natural home for the reconcile step §4 concluded prose can't provide ("state still shows Bleeding
  active — anything you missed?"). **Not pursued: it reintroduces the second call**, which is the entire
  §3 win (~43% cheaper, ~34% faster) — and `low` effort (§4a) already fixes the bug that would have
  justified paying for it. Note the honest comparison though: it is 2 calls with *both* surfaces enforced,
  versus today's `2call-cheap` which is 2 calls with only state enforced and the second call's prose
  discarded. **No §3 arm measured this.** Revisit if F1 shows `low` doesn't hold and the R4 write-surface
  redesign also fails — or if enforced narrative ever becomes a product requirement.
- **`effort: "xhigh"` / `"max"`.** The ladder is measured at `none`/`low`/`medium`/`high`. Not pursued
  because `low` already flips the target field at no cost (§4a) — spending more effort has nothing left to
  buy on the one column that separates.
- **The OpenRouter `responses` surface.** A different API shape with its own reasoning controls
  (`backends/openrouter/runners/chat/responses.ts` exists and is unused on this path). Not pursued: the fold
  needs tools + prose co-emission, which chat-completions already delivers; no known `responses` capability
  addresses a gap we still have.
- **Migrating this path to the Anthropic native wire / skin.** Native exposes two axes where OR gives one —
  `thinking: {adaptive|disabled}` **×** `output_config.effort` (`low`…`max`, no `none` rung) vs OR's single
  `reasoning: {effort}` (which *does* have `none`). Originally not pursued: the native probe showed it buys
  neither composition (§2) nor useful interleaving, and it costs the OR provider-routing/fallback surface.
  **⚠️ Partially re-opened by §4a's ladder comparison:** OR delivers 3–6× less thinking than native at the
  same nominal effort, and OR's `high` sits below native's `medium`. If a future requirement genuinely needs
  deliberation depth, **this wire may be unable to supply it at any setting** — which would make native
  migration a capability question rather than a preference. Blocked on F5.

## 8. Reference numbers (Sonnet 5 via OR)

- 1call-tools: **$0.075 / 6-turn game, ~60s, 1 call/turn.** vs 2call-cheap $0.131 / 91s / 2 calls.
- Isolated tool round (today's call #2): ~6.6k input + ~700 output ≈ $0.023–0.032.
- Enrichment: +$0.008 / 8-turn game, +3 tool calls. Coverage 33→37/43 fields.
- Reasoning at `high` (§3, 6-turn): +latency, no quality payoff (skip).
- Reasoning ladder on the 8-turn coverage game, Arm B (§4a) — `none` $0.149 / $0.158 (two runs) ·
  **`low` $0.152** · `medium` $0.178. `removeCondition` 0 · 0 · **1** · 1.
- **Variance floor (same config, two runs): 15/43 fields move, cost ±6%, tool calls ±1.** Any single-field
  delta of ±1–2 from one run per arm is noise. Budget 3 runs per arm for anything field-level.
- Total spend across all spikes: ~$2.5 (matrix + coverage A/B) + ~$0.51 (composition probe, effort ladder).

---

## Appendix A — enriched tool descriptions + tracking guide (ship these)

**State-tracking guide (system-prompt addendum):** be thorough; the panel should reflect the FULL richness
of the narration. Each turn record ALL that changed: any on-screen character → set `mood` on every
demeanor shift, `appearance`+`outfit` when described, `thoughts` for implied inner state, `relationship`
when it forms/changes, customFields `trust`/`role` as they establish; scene → location/timeOfDay/weather on
change, advance `plot.actSummary`; bodies → `hpDelta`/`poolDeltas`/`addCondition`/**`removeCondition` when
an effect ends**/`status`; items → `add` with `description`+`location`, `remove` when used, `walletDeltas`
for coin; defined meters → `set_widget_value`; quests → `upsert_quest` with objectives; `add_journal_entry`
with the right `type`. Sparse tracking makes the panel feel dead.

Per-tool enriched descriptions with worked examples (the verbatim Arm-B strings — port into
`tools/index.ts` at build time):

- **update_party** — "Record changes to any actor's body/condition. hpDelta: damage (negative) or healing
  (positive). poolDeltas: spend/restore named pools like Mana/Stamina/Focus (negative=spent). addCondition:
  a new status effect (e.g. Blessed, Bleeding, Poisoned) with an optional numeric modifier. removeCondition:
  when an effect ends. status: a short current-state line ('bleeding, on edge'). EXAMPLE — took a cut and
  spent wind fighting: `{targetRef:'player', hpDelta:-5, poolDeltas:[{name:'Stamina',delta:-3}],
  addCondition:{name:'Bleeding',modifier:-1}, status:'bleeding, breathing hard'}`."
- **update_inventory** — "Items and coin on an actor. add: new items — ALWAYS give a `description` and a
  `location` (where it's carried: 'belt pouch', 'sheathed'), plus quantity. remove: items used/lost/given
  away. walletDeltas: coin gained/spent (negative=spent). EXAMPLE — gifted an oil vial, paid 20 gold:
  `{targetRef:'player', add:[{name:'Vial of Sanctified Oil', description:'warded holy oil, faintly glowing',
  quantity:1, location:'belt pouch'}], walletDeltas:[{name:'gold', delta:-20}]}`."
- **update_scene** — "The scene + who is present. Set location/timeOfDay/weather when they change;
  calendarDate/day as days pass; advance plot.act/title/actSummary as the story moves. presentUpsert: for
  EACH character on screen set mood (every demeanor shift), appearance + outfit (when described), thoughts
  (their implied inner state), relationship {kind,label}, and customFields trust/role. recentEvent: a
  one-line beat. EXAMPLE — a priest warms to you: `{timeOfDay:'evening', presentUpsert:[{name:'Sister
  Vesna', emoji:'🕯️', mood:'warming', appearance:'tall, silver-haired, sharp-eyed', outfit:'patched grey
  habit', thoughts:'weighing whether to trust you', relationship:{kind:'ally',label:'wary priest'},
  customFields:[{name:'trust',value:'40'},{name:'role',value:'chapel keeper'}]}], recentEvent:'Vesna
  softened as you shared road news'}`."
- **set_widget_value** — "Set a custom meter the game defines (e.g. Suspicion). value: the new reading; max:
  if the ceiling changes; items: for list-type widgets. EXAMPLE — suspicion rises as she watches you:
  `{widgetRef:'Suspicion', value:35}`."
- **upsert_quest** — "Create/update/complete/fail a quest. Give a description and objectives\[] on create;
  use action 'complete'/'fail' when it resolves. EXAMPLE — a new task opens: `{name:'Reach the Vault of
  Ash', action:'create', description:'Get to the vault before the new moon', objectives:['Find the road
  north','Enter the vault']}`."
- **add_journal_entry** — "Log a notable beat with the right type (location/npc/combat/quest/item/event/
  note) + a short title + content. EXAMPLE: `{type:'combat', title:'Ambush at the Chapel', content:'Corvin
  drew on you at the altar; you took a cut but stayed up.'}`."
- **no_changes** — "Call ONLY when nothing trackable changed. Do NOT use this to avoid filling fields — if
  anything in the fiction moved, record it."

## Appendix B — artifacts

All under **`scripts/probes/rpg-extraction/`** (moved off the session scratchpad 2026-07-30 — the earlier
`scratchpad/spike/` path in this doc was never valid: the repo's `scratchpad/` is gitignored and absent).
`out*/` are gitignored — present on disk, not in git.

- Method matrix: `out/SUMMARY.md`, `out/summary.json`, per-method `transcript.md` + `turn-N.json`.
- Field coverage: `out2/COVERAGE-SUMMARY.md`, `out2/coverage.json`, per-arm `COVERAGE.md` + `transcript.md`.
- Reasoning sweep (§4a): `out2-none/`, `out2-low/`, `out2-medium/`; per-message-steering arms (R4a):
  `out2-nudge-think/`, `out2-low-reconcile/`. `coverage.json` records `reasoning_effort` + `nudge_mode`.
- **F1 decisive test (§4c): `f1-none-{1,2,3}/`, `f1-low-{1,2,3}/`** — the "Ford Road" affliction game,
  12 turns, five scripted retirements. `coverage.json` carries per-turn `truth` (expected/hit/missed/
  spurious) plus an arm-level `gt` block. Run with `SPIKE_GAME=afflictions`.
- Harnesses: `run.mjs` (matrix), `run-coverage.mjs` (coverage; env-parameterized — `SPIKE_ARMS`,
  `SPIKE_EFFORT`, `SPIKE_OUT`), `replay-toolround.mjs` (the required-vs-auto content probe),
  `native-wire-probe.mjs` (§2 — Anthropic native Messages API: tools × `output_config.format` ×
  adaptive thinking), `native-format-roundtrip.mjs` (§2 — the two-round proof that the schema lands on the
  final text turn). Both use `ANTHROPIC_API_KEY`, ~$0.03 and ~$0.01/run, print results only, write nothing.
- **`steer-probe.mjs` (§4d)** — the READ half of the loop: silently decays a tracked NPC meter across 8
  turns in three arms (pinned / bare number / glossed) and scores each turn with a blind judge. Writes
  `steer-out.json` (full transcripts). ~$0.23/run, OpenRouter key.
- **`card-teach-probe.ts` (§4h)** — the F2 card-teach matrix: 10 scripted card OPPORTUNITIES, the real
  `buildLiteReminder` with only the teach block swapped per arm (A–H), scored `emitted` vs **`rendered`** (a
  `card` span out of the production tokenizer — the split that found the defect). `CARD_ARMS` picks arms,
  `CARD_DRY=1` prints the injections free, `CARD_SCORE=<file>` re-scores a saved run free. ~$0.18/arm,
  OpenRouter key. Transcripts `card-teach-out{,-run2,-run3,-run4}.json` (gitignored); samples in
  `CARD-TEACH-SAMPLES.md`.
- `effort-ladder-native-vs-or.mjs` (§4a) — native `output_config.effort` vs OR `reasoning:{effort}` on
  identical input, thinking tokens as the signal. ~$0.39/run, needs BOTH keys.
- `effort-reasoning-probe.mjs` (§4a) — does `reasoning:{effort}` emit reasoning on our workload shape.
- Real templates: `real-cheap-toolround.json` (7 tools), `real-reliable-structured.json` (monolith
  schema), `real-narrative-turn.json` (persona + reminder format), `captures.json`.
- Specs: `SPEC.md`, `SPEC-coverage.md`.
