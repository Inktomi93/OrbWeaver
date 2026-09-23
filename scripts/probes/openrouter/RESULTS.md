# OpenRouter probe batch — verdicts

**Run:** 2026-08-01 (F4/F4a/F5/OR-5/OR-7) · 2026-08-08 (OR-5b/OR-7b) · **Wire:** `anthropic/claude-sonnet-5`
via OpenRouter (Anthropic pinned, `allow_fallbacks:false`), plus the Anthropic Messages API for F5's native
reference arms.
**Spend:** ~$0.20 OpenRouter + ~$0.12 Anthropic native ≈ **$0.32** (08-01) · **$0.152** OpenRouter (08-08).
**Raw evidence:** `results/<probe>.jsonl` — every arm's HTTP status + full usage block, append-only.
**Sibling docs:**
`docs/design/rpg-extraction-one-call-spike.md` §7 (the F-list).

| # | Question | Verdict | Consequence |
|---|---|---|---|
| **F4** | do enriched tool descriptions break the prompt-cache prefix? | **YES — any tool-payload edit invalidates the WHOLE prefix** (cached 2841 → **0**) | tool descriptions/schemas are cache-key bytes: keep them stable per session |
| **F4a** | does changing `effort` bust the OR cache? | **YES, but per-effort ENTRIES, not invalidation** — the `low` entry survived a `high` round-trip | each distinct effort costs ONE extra full prefix write per TTL window |
| **F5** | is native thinking depth reachable through OR? | **NO — 205 vs 5783 thinking tokens (28×)**; neither `max_tokens` nor `reasoning:{max_tokens}` moves it | deliberation depth is capped by this wire; tool-call output was unaffected |
| **OR-5** | do array-offset breakpoints under-cache tool-heavy turns? | **REFUTED in the strong form** — the read still hits (3477 both ways); cost is a small wasted WRITE per depth | a real but bounded defect; fix is ~2 lines, ROI scales with tool-result size |
| **OR-7** | is replaying a reasoning block a hard 400? | **only when the signature is missing** — verbatim 200 · unsigned **400** · ST `reasoning.encrypted` 200 · drop 200 | if reasoning is ever round-tripped, the signature must be structurally non-optional |
| **OR-5b** | does counting depth in ROLE SWITCHES (tool exchanges transparent) remove the wasted write? | **YES — 5341 wasted cache-write tokens → 0**, and the placement is INVARIANT across a second recursion depth | the §5 fix, measured; ~$0.0027/depth recovered on a fat parallel exchange |
| **OR-7b** | is DROPPING reasoning still safe past ONE hop? | **YES — 3-hop chain 200/200/200 and the chain still carried a fact only a mid-chain tool result revealed** | the finding-7 deferral premise HOLDS at the shape it is actually about |

---

## F4 — enriched tool descriptions vs the prompt-cache prefix

`results/f4.jsonl` · one variable: the description string of ONE tool (the last of three). System block,
user message, tool names and tool schemas byte-identical across all four arms.

| arm | tool description | prompt | cached | cache write | cost |
|---|---|---|---|---|---|
| 1 prime-terse | 36 B | 2952 | 0 | 2841 | $0.0080 |
| 2 replay-terse | 36 B | 2952 | **2841** | 0 | $0.0014 |
| 3 enriched-tail | 396 B | 3075 | **0** | 2964 | $0.0083 |
| 4 replay-enriched | 396 B | 3075 | **2964** | 0 | $0.0015 |

**Verdict.** The OpenAI-compat `tools` field is part of the Anthropic cached prefix and sits UPSTREAM of
the system breakpoint: changing 360 bytes in one tool's description dropped `cached_tokens` from 2841 to
**zero**. Arm 4 proves arm 3 was invalidation, not a fluke — the enriched payload caches perfectly well
on its own. Enrichment's standing cost is trivial (**+123 prompt tokens/turn**, billed at the 0.1× cached
rate); the cost is entirely in *changing* it.

**RECOMMENDATION (do not build in this lane).** The rpg tool round rebuilds BOTH the descriptions and the
tool parameter schemas from live game state on every call —
`entry/compose/rpg.ts:buildToolRoundWireTools` → `buildRpgToolDescriptions({config, refs})` +
`constrainExtractionSchema(…, refs)`, where `refs` carries `actorRefs` and `conditionNames` derived from
the CURRENT snapshot (`compose/rpg.ts:407,411`). Every time a condition appears/retires or an actor joins,
the tools payload changes and that turn re-bills the entire prefix at the 1.25× cache-write rate
(measured on a 10k prefix elsewhere in this batch: ~$0.029 written vs ~$0.0028 read — a **~10×** turn).
Two honest options, neither taken here: (a) accept it and record the cost in the cache receipt, or
(b) hoist the volatile ref enumerations OUT of the tool payload into a *late* message (below the history
breakpoint), leaving the tool descriptions/schemas static per game config. Worth measuring whether the rpg
tool round's system block is already per-turn volatile before spending anything on (b) — if the prefix
never caches on that path today, this changes nothing.

**LANDED 2026-08-01 — option (b), on the FOLDED vehicle only.** The precondition splits by vehicle, and the
recommendation above was half-wrong about the cause:

- *The dedicated `cheap` round is already lost, so it was left alone.* Its own system block re-renders the same
  refs every call (`toolRoundSystem` → `composePlaneTeaching` + `refEnumerationLines(refs, …)`,
  `compose/rpg.ts`), its whole history is ONE per-turn user prompt, and it passes no
  `historyCacheBreakpointFromEnd`. De-volatilizing its tools would buy nothing — and it is the vehicle whose
  backend (local vLLM under `tool_choice:"required"`) actually grammar-enforces the enums, so it keeps them.
- *The FOLDED turn's prefix DOES cache, and the tools were the only volatile thing in it.* Those tools ride the
  CHARACTER turn's `tools[]` (`pipeline.ts:attachTerminalTools`), upstream of a system block whose static half
  carries the `cache_control` breakpoint; rpg's volatile state block is an `in_chat` **depth-0** injection, which
  `computeHistoryBreakpoint` keeps BELOW the rolling breakpoint. So every new NPC / gained condition was
  re-billing the whole story prefix.
- *The descriptions were never the leak.* `buildRpgToolDescriptions` takes `refs` but reads only `config` — the
  volatility was entirely `constrainExtractionSchema`'s ref enums.

The fix is `cacheStableExtractionRefs` (`@orb/contracts/rpg/extraction`), bound at `buildFoldedTurnBuilder`: the
config-derived constraints ride on (tracker key enums, locked-tracker prevention, game-tracker plane pruning,
establish-when-unset), the scene-derived ones (`actorRefs`, `conditionNames`, the per-actor `oneOf` split) drop —
they are advisory on that wire anyway (wire tools are sent WITHOUT `strict`), the depth-0 state block already
enumerates the cast + conditions in prose, and the R5 ghost guard drops an unreachable `targetRef` at apply.
Residual, deliberate: `establishScene` still moves (once per fresh game, and on each reconcile beat).

## F4a — does an `effort` change bust the OR cache?

`results/f4a.jsonl` · one variable: the effort string. No tools; identical 11.4k-token prefix throughout.

| arm | effort | cached | cache write | cost |
|---|---|---|---|---|
| 1 prime-low | low | 0 | 11438 | $0.0291 |
| 2 replay-low | low | **11438** | 0 | $0.0028 |
| 3 switch-high | high | **0** | 11438 | $0.0291 |
| 4 replay-high | high | **11438** | 0 | $0.0026 |
| 5 back-to-low | low | **11438** | 0 | $0.0028 |

**Verdict.** Effort IS part of the cache key on the OR wire — a `low → high` flip missed the cache and
re-wrote the whole prefix. But arm 5 is the load-bearing one: after the high round-trip, the ORIGINAL low
prefix still read 11438 cached tokens. So the mechanism is **separate cache entries per effort value**,
not invalidation. Per-turn effort variation is therefore expensive, not ruinous: the bill is one extra
full write per distinct effort per TTL window (here **+$0.026 per new effort value on an 11.4k prefix**),
after which each effort has its own warm entry.

**RECOMMENDATION.** Effort belongs to the preset/session, not to the turn. This does not need a code
change today (`buildReasoningRequest` reads a resolved knob, not a per-turn toggle) — but it is a hard
constraint on any future "think harder on this one" UI lever, and it means the `provider.cache` receipt's
cache-write spike (`chat-completions.ts:emitCacheReceipt`) can legitimately fire from an effort change
with nothing wrong. Worth a line in the effort knob's own doc rather than a guard.

## F5 — OR effort translation / native-depth reachability

`results/f5.jsonl` · identical messages + identical 4 tools on both wires. Signal: OR
`completion_tokens_details.reasoning_tokens` vs native `output_tokens_details.thinking_tokens`.

| wire | knob | max_tokens | thinking | output | tool calls |
|---|---|---|---|---|---|
| openrouter | `effort:"low"` | 4000 | 83 | 473 | 5 |
| openrouter | `effort:"high"` | 4000 | 113 | 1052 | 5 |
| openrouter | `effort:"high"` | 16000 | **156** | 1562 | 5 |
| openrouter | `reasoning:{max_tokens:8000}` | 16000 | **205** | 1437 | 5 |
| native | `output_config:{effort:"high"}` | 16000 | **497** | 1228 | 5 |
| native | `output_config:{effort:"max"}` | 16000 | **5783** | 6611 | 5 |

**Verdict.** Both candidate levers fail. Quadrupling `max_tokens` at constant effort moved thinking
83→156 tokens (OR does *not* derive a budget from `max_tokens` in any meaningful way), and OR's explicit
`reasoning:{max_tokens:8000}` yielded **205** tokens — i.e. it is a ceiling request, not a budget the
model spends. Native at the same nominal `high` thinks 3.2× more, and native `max` thinks **28× more**
than OR's best. Confirms and sharpens finding §6: **real deliberation depth is unreachable on this wire at
any setting.**

**RECOMMENDATION.** Do NOT re-open the Anthropic-skin migration on this evidence. The counter-measurement
is in the same table: tool-call count was **5 on every arm, both wires** — 28× more thinking bought
nothing on the workload we actually ship, consistent with the rpg spike's finding that `low` already flips
the only field that separates. Treat "thinking depth ≤ ~200 tokens" as a documented capability ceiling of
the OpenRouter connection, and re-open only if a feature lands whose quality is *measured* to track
thinking depth. (Second datum for that day: native `max` took **72 s** for one turn.)

## OR-5 — cache breakpoints count array offsets, not conversational turns

`results/or5.jsonl` · one variable: the breakpoint index. Identical 7-row history in arms 2–4.
The probe reproduces the production sequence: arm 1 is the depth-1 call, arms 2–4 are the depth-2 call
after `runRecurseLoop` appended one assistant tool-call row + one tool row.

| arm | history len | offset | idx | role at idx | cached | cache write |
|---|---|---|---|---|---|---|
| 1 turn1-offset1 | 5 | 1 | 3 | assistant | 0 | 3477 |
| 2 depth2-**stale** offset1 (what we ship) | 7 | 1 | **5** | assistant *(generated this turn)* | 3477 | **30** |
| 3 depth2-corrected offset3 | 7 | 3 | 3 | assistant *(stable boundary)* | 3477 | **0** |
| 4 breakpoint on a `role:"tool"` row | 7 | 0 | 6 | tool | 3507 | 81 |

**Verdict — the strong hypothesis is REFUTED.** Tool-heavy turns do *not* under-cache: Anthropic's
automatic lookback finds the earlier breakpoint's entry, so the slid breakpoint still read the full 3477
stable tokens. The real defect is narrower: the slid breakpoint writes a NEW cache entry that covers bytes
generated this turn (30 tokens here) and can therefore never be read again — a wasted write per tool
depth, sized by the tool exchange, billed at 1.25×. Arm 4 confirms the old note: a breakpoint on a
`role:"tool"` message is accepted (200) and writes.

**RECOMMENDATION (do not build in this lane).** The drift is real and the fix is tiny:
`chat/engine/pipeline.ts:runRecurseLoop` re-sends `{ ...input.request, history }` with an unchanged
`cacheBreakpointFromEnd` after `history = [...history, ...toolExchangeMessages(reduced.content, batch)]`
— it should advance the offset by the number of rows it just appended (`toolExchangeMessages` emits
exactly one wire row per element, so `+= appended.length` is exact). Priority is LOW on the measured
number (~$0.0001/depth here) but scales linearly with tool-result size — a 2k-token tool result makes it
~$0.0075 per depth. Not measured: whether a large fan-out can push the intended boundary out of
Anthropic's ~20-block lookback, which WOULD turn this into a real miss.

## OR-5b — the FIX: depth counted in role switches, tool exchanges transparent

**Run:** 2026-08-08 · `results/or5b.jsonl` · spend **$0.0910** · one variable: where the breakpoint lands.
The history is the production shape at recursion depth 2 with a **parallel batch of 3** and **fat tool
results** (~2.2k tokens each) — the shape that makes the defect expensive rather than a rounding error.

| arm | rows | bp idx | role at idx | cached | cache write | cost |
|---|---|---|---|---|---|---|
| 1 prime-canon (5 rows, depth 1 → idx 3) | 5 | 3 | assistant | 0 | 7727 | $0.01984 |
| 2 **stale array offset 1** (pre-fix) | 9 | **7** | **tool** | 7727 | **5341** | $0.02024 |
| 3 **conversational depth 1** (shipped) | 9 | **3** | assistant | 7727 | **0** | $0.01752 |
| 4 conversational depth 1, SECOND recursion depth | 13 | **3** | assistant | 7727 | **0** | $0.03339 |

**Verdict.** The fix holds on the live wire and the number is bigger than OR-5's original estimate, because
OR-5 measured a 1-call exchange with a 20-token result. Here:

- The stale array offset lands on a **`role:"tool"` row** and writes **5341** cache tokens that describe
  bytes generated this turn — an entry that can never be read again. Cost of that one wasted write:
  **$0.0027 on this turn** ($0.02024 vs $0.01752, same prompt, same 7727 cached tokens).
- The conversational depth lands on the **same stable assistant boundary as arm 1**, writes **zero**, and
  still reads the full 7727 primed tokens.
- **Arm 4 is the invariance receipt.** After a SECOND recursion depth (13 rows, 4 more appended), the
  resolved index is **still 3** and the write is still **0**. The array grew by 8 rows across two depths; the
  breakpoint did not move. That is the property `tests/support/parity-runner.ts:223 offsetInvariant` names and
  the reason `pipeline.ts:runRecurseLoop`'s unchanged re-send needs no fix of its own — the placer now
  ignores exactly the rows the loop appends.

Scaling: the waste is the size of the tool exchange, billed at the 1.25× cache-write rate, **per depth**. A
3-call rpg state round with 2k-token results is ~$0.003/depth; a 5-depth agentic chain is ~$0.015/turn.

## OR-7 — reasoning round-trip

`results/or7.jsonl` · one variable: the shape of the replayed assistant reasoning. Captured turn, tool
result and follow-up user message identical across arms 2–5.

| arm | replayed shape | status |
|---|---|---|
| 2 drop (what we ship) | — | 200 |
| 3 verbatim | `reasoning.text` + `signature` | **200** |
| 4 unsigned | `reasoning.text`, signature deleted | **400** |
| 5 st-encrypted | `reasoning.encrypted` + `data` | **200** |

Arm 4's verbatim upstream body:

```
400  messages.1.content.0: Invalid `signature` in `thinking` block   (provider_name: Anthropic)
```

**Verdict.** Replaying is safe *only* if the signature survives byte-exact. Both working shapes are
confirmed: OR's returned object verbatim, and SillyTavern's rebuilt `reasoning.encrypted` + `data` (which
carries no text and therefore cannot hit the unsigned-400 at all). Dropping remains safe. A first
`blocked` row in the JSONL is kept as evidence of a second fact: a trivial beat with
`tool_choice:"required"` produced **zero** reasoning tokens at `effort:"high"` — there is often nothing to
round-trip.

**RECOMMENDATION.** Keep dropping. If the `ChatContentPart` reasoning arm is ever built (findings §7),
the signature must be structurally non-optional or the shape must be `reasoning.encrypted` — a
reasoning part that can exist without its signature is a hard 400 on every subsequent turn of the chat,
and `shared.ts:reshapeReasoningDetails` currently drops `signature` while keeping `text`, which is exactly
the fatal combination. The payoff (agentic continuity) is still unquantified; the failure mode now is not.

## OR-7b — the deferral premise at MULTI-hop, and replay shape × splice POSITION

**Run:** 2026-08-08 · `results/or7b.jsonl` · spend **$0.0610** across four iterations (two of which were
instrument repairs — recorded below, because both would have shipped a false verdict). **Probe and record
only** — the finding-7 deferral (we never replay reasoning) stands and no product code changed.

OR-7 measured a SINGLE trivial hop, which is the case least able to expose a continuity loss. This probe
re-asks at the shape the ruling is about: a 3-hop tool chain where every replayed assistant turn arrives
with its thinking block dropped, and the final answer depends on a nonsense rune (`vhalthenmir`) revealed
ONLY inside a mid-chain tool result — so "did it keep the fact" is measured, not asserted.

| arm | position | status | prompt | reasoning tk | cost |
|---|---|---|---|---|---|
| 1 chain-drop hop 1 (3 parallel calls) | — | **200** | 775 | 9 | $0.00662 |
| 2 chain-drop hop 2 (1 call) | — | **200** | 1216 | 0 | $0.00365 |
| 3 chain-drop hop 3 (answers) | — | **200** | 1327 | 0 | $0.00309 |
| 4 unsigned replay | deep (hop 1's turn) | **400** | — | — | — |
| 5 ST `reasoning.encrypted` | deep (hop 1's turn) | **200** | 1621 | 0 | $0.00387 |
| 6 unsigned replay | last assistant | **400** | — | — | — |
| 7 ST `reasoning.encrypted` | last assistant | **200** | 1621 | 0 | $0.00376 |

Final text, arm 3: *"Speaking **vhalthenmir**, the rune from the sole unweathered ward stone, the ancient
door grinds open before you."*

**Verdict — the deferral premise HOLDS.** (a) Dropping is safe past one hop: 200 on every hop of a 3-hop
chain, and the chain still named a fact that existed only in a hop-1 tool result it never saw again. No
degradation to report. (b) The unsigned-replay 400 re-confirms, verbatim upstream body:
`messages.1.content.0: Invalid \`signature\` in \`thinking\` block` (provider Anthropic). (c) ST's cheaper
rebuilt `reasoning.encrypted` + `data` + `format` shape is accepted, 200. **New datum: splice POSITION does
not matter** — both shapes behave identically whether the block sits on the last assistant turn or deep in
the chain, so the rule is per-block, not per-position.

**Two instrument repairs, kept as evidence** (both produced a confident, wrong verdict first):

1. *The chain ends on an assistant row.* Splicing a replay into it and sending as-is returns **400 —
   "This model does not support assistant message prefill. The conversation must end with a user message."**
   That is a 400 that says nothing about signatures, and on the first run it made BOTH replay arms read as
   rejected. The replay arms must re-open with a user turn.
2. *A signed block with ZERO reasoning tokens is not validated.* The second repair run captured
   `hasSignature: true` at hop 1 with `reasoning_tokens: 0`, and the unsigned replay returned **200** — i.e.
   an empty thinking block's signature is not checked, and the arm was vacuous while looking like a
   contradiction of OR-7. The 400 reproduces only once hop 1 does REAL thinking (`reasoning_tokens: 9`).
   A replay arm now records `hasSignature` and self-declares `blocked` when there is nothing signed to send.
