# OpenRouter probe batch — verdicts

**Run:** 2026-08-01 (F4/F4a/F5/OR-5/OR-7) · 2026-08-08 (OR-5b/OR-7b) · 2026-09-23 (OR-8, OR-9, OR-10) · 2026-09-24 (OR-11) · **Wire:** `anthropic/claude-sonnet-5`
via OpenRouter (Anthropic pinned, `allow_fallbacks:false`), plus the Anthropic Messages API for F5's native
reference arms.
**Spend:** ~$0.20 OpenRouter + ~$0.12 Anthropic native ≈ **$0.32** (08-01) · **$0.152** OpenRouter (08-08) · **$0.104** OpenRouter + ~$0.10 Anthropic native (09-23, OR-8) · **$0.86** OpenRouter + ~$0.7 Anthropic native (09-23, OR-9) · **$0.07** OpenRouter + ~$0.6 Anthropic native (09-23, OR-10) · about $0.08 + $1.79 + $0.20 Anthropic native (09-24, OR-11 legs 1, 2 and 3, estimated at list prices).
**Raw evidence:** `results/<probe>.jsonl` — every arm's HTTP status + full usage block, append-only.
**Sibling docs:** D174.

| # | Question | Verdict | Consequence |
|---|---|---|---|
| **F4** | do enriched tool descriptions break the prompt-cache prefix? | **YES — any tool-payload edit invalidates the WHOLE prefix** (cached 2841 → **0**) | tool descriptions/schemas are cache-key bytes: keep them stable per session |
| **F4a** | does changing `effort` bust the OR cache? | **YES, but per-effort ENTRIES, not invalidation** — the `low` entry survived a `high` round-trip | each distinct effort costs ONE extra full prefix write per TTL window |
| **F5** | is native thinking depth reachable through OR? | **NO — 205 vs 5783 thinking tokens (28×)**; neither `max_tokens` nor `reasoning:{max_tokens}` moves it | deliberation depth is capped by this wire; tool-call output was unaffected |
| **OR-5** | do array-offset breakpoints under-cache tool-heavy turns? | **REFUTED in the strong form** — the read still hits (3477 both ways); cost is a small wasted WRITE per depth | a real but bounded defect; fix is ~2 lines, ROI scales with tool-result size |
| **OR-7** | is replaying a reasoning block a hard 400? | **only when the signature is missing** — verbatim 200 · unsigned **400** · ST `reasoning.encrypted` 200 · drop 200 | if reasoning is ever round-tripped, the signature must be structurally non-optional |
| **OR-5b** | does counting depth in ROLE SWITCHES (tool exchanges transparent) remove the wasted write? | **YES — 5341 wasted cache-write tokens → 0**, and the placement is INVARIANT across a second recursion depth | the §5 fix, measured; ~$0.0027/depth recovered on a fat parallel exchange |
| **OR-8** | which layout of ADJACENT same-role rows keeps the prior call's cache entry readable? | **one message, one text block per speaker** — squashing into ONE string reads **0**; parts, or consecutive messages (which the API and OR both fold into parts), read the whole prior entry and write only the new speaker (**57** tokens) | squash the role, not the text: SHAPE's same-role merge must keep each source row its own text block |
| **OR-9** | with signed thinking carried on each reply, which layout of a same-role run is accepted, and which keeps the cache? | **direct: one message with thinking interleaved per reply (V1) or consecutive messages (V3) both work and read the prior entry; OpenRouter (both endpoints) 400s V1 and folds V3 into one message that keeps only the FIRST reply's thinking**; dropping earlier thinking (V2) reads **0**; a tampered signature is refused everywhere; under prefix binding (Opus 5.5, new accounts) every carried block fails because the speaker cue that preceded it was deleted, and only a kept cue (V6) is valid | keep F1; never fold reasoning-bearing rows on the openai-compat body; the carry on Opus 5.5/Fable 5.1 needs an append-only history (keep the cue), which is a design question |
| **OR-10** | with the carry on, which placement of per-turn rows keeps every signed thinking block valid on the models that bind it (Opus 5.5, Fable 5.1)? | **deleting a speaker cue (today) and moving a depth-4 note both break binding: "error" 400s, "drop_block" drops the blocks after the edit and reads 0 cache; a turn-scoped system cue or note appended and left in place, and a speaker cue kept as an ordinary user row, stay clean with the cache growing; a turn-scoped system cue right after a reply is a placement 400; any top-level system edit drops every block** | make every per-turn row append-only: cues as kept rows, depth notes and volatile system content as turn-scoped system messages at the tail; run the carry with drop_block and alarm on drops |
| **OR-11** | does a model OBEY an override in a depth-2 system row in its legal slot `[u, S, a, u]`, or only accept it? | **obeyed on all three: sonnet-5 5/6, opus-4-8 5/5, control opus-5-5 5/5; the same note folded to user text: sonnet-5 1/5, opus-4-8 0/5, opus-5-5 5/5** | keep `historySystemRows: true` on sonnet-5 and opus-4-8; the tail row they ignore and the depth row they obey are separate facts. Leg 2: today's fold (note merged after `u1`'s text) carries a standing note 19/30 and a next-reply note 0/30; the same note as a separate block on the LATEST user message carries 27/30 and 30/30 with the current frame. Leg 3, haiku-4-5 (400s any system row): the bare fold before the user text carries a next-reply note 10/10 against 2/10; no placement carries a standing note. Shipped: the depth-keeping bare fold before the user text |
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

## OR-8 — adjacent same-role rows vs the prompt-cache entry

**Run:** 2026-09-23, twice. Run 1 used a ~2.1k-token prefix; run 2 used ~1.2k, just over sonnet-5's 1024 floor. Every
variant gave the same verdict. Evidence: `results/or8.jsonl` · probe: `or8-same-role-adjacency.ts` · wires: Anthropic
Messages direct (`claude-sonnet-5`) and OpenRouter (`anthropic/claude-sonnet-5`, Anthropic pinned, streamed with
`debug.echo_upstream_body`) · marker `{type:"ephemeral"}` (5m) · spend **$0.104** OpenRouter (billed) + ~$0.10 direct
(36,669 write / 14,829 read tokens over 30 calls, priced at OR's per-token rates).

The defect under test: in a per-speaker group room, SHAPE's `squashSameRole` (`chat/assembly/role-squash.ts`) joins
adjacent assistant rows into ONE string. In call 1 the marker sits on `"Mara: …"`. In call 2 that block is
`"Mara: …\n\nWren: …"`, so the block boundary the entry ended on is gone and the read falls back to the system
entry. The lane cache-check measured this: `msg_011CfLbSECMApXsYxJBSxnBf` wrote 3159 on Mara's row, and
`msg_011CfLbSPpYVWa6rGmBypmGb` read 3405, system only. Here the system prompt is short and unmarked, so a miss
reads **0**.

Each variant is its own nonce'd two-call pair. P = the long user row, M/W = the two speakers, `*` = the marker. Every
call ends on a user speaker cue, and the cue differs between the calls (`[Wren speaks next.]`, then `[Mara speaks next.]`).

| variant | call 1 | call 2 |
| - | - | - |
| D control | `[P*, M, cue]` | `[P*, "M\n\nW", cue]` |
| A squash (ships today) | `[P, M*, cue]` | `[P, "M\n\nW"*, cue]` |
| A2 pair (marker also on P) | `[P*, M*, cue]` | `[P*, "M\n\nW"*, cue]` |
| B parts | `[P, [M*], cue]` | `[P, [M, W*], cue]` (one message, two text parts) |
| C unsquashed | `[P, M*, cue]` | `[P, M, W*, cue]` (two consecutive assistant messages) |
| CS: C in the product spelling | as C | as C, but unmarked rows are plain strings (the OR wire after `openai-compat/body.ts` rule 9) |
| EB / EC planted negative | as B / C | as B / C, with one byte of M changed (`lantern` → `lanterN`) |
| N no cue | `[P, M*]` | — |

### Direct (Anthropic Messages API)

| variant | call | status | response id (run 2) | prompt | write | read | run 1 write / read |
| - | - | - | - | - | - | - | - |
| D-control | 1 | 200 | `msg_011CfLcipMyoKvKFJXQ9Bt6X` | 1275 | 1198 | 0 | 2113 / 0 |
| D-control | 2 | 200 | `msg_011CfLciugxa2jFYaszcYB5J` | 1333 | 0 | **1198** | 0 / 2113 |
| A-squash | 1 | 200 | `msg_011CfLcizfMYuSySL3b4Wh71` | 1275 | 1261 | 0 | 2176 / 0 |
| A-squash | 2 | 200 | `msg_011CfLcj5hDKahTZDDc6PvKS` | 1333 | 1319 | **0** | 2234 / 0 |
| A2-pair | 1 | 200 | `msg_011CfLcjAqXi4UgA7ATnsZ3U` | 1294 | 1280 | 0 | 2210 / 0 |
| A2-pair | 2 | 200 | `msg_011CfLcjGJCZBAcc5SqurgPR` | 1352 | 121 | **1217** | 121 / 2147 |
| B-parts | 1 | 200 | `msg_011CfLcjMcB5yWLbUsU8H15r` | 1275 | 1261 | 0 | 2176 / 0 |
| B-parts | 2 | 200 | `msg_011CfLcjbw9KyRoj6JrhpsSM` | 1332 | 57 | **1261** | 57 / 2176 |
| C-unsquashed | 1 | 200 | `msg_011CfLcjq4S4E4inABSP1cUj` | 1275 | 1261 | 0 | 2176 / 0 |
| C-unsquashed | 2 | 200 | `msg_011CfLcjuyMeRcfkGersFZaU` | 1333 | 58 | **1261** | 58 / 2176 |
| CS-product-spelling | 1 | 200 | `msg_011CfLckPwbn1hv4KfXMw4Ep` | 1294 | 1280 | 0 | not run |
| CS-product-spelling | 2 | 200 | `msg_011CfLckVRW6pHBjbgioxRSu` | 1352 | 58 | **1280** | not run |
| EB-parts-tampered | 1 | 200 | `msg_011CfLck17fpHrtZxWHNEF6D` | 1294 | 1280 | 0 | 2210 / 0 |
| EB-parts-tampered | 2 | 200 | `msg_011CfLck7X8qfN1ox2GxYBMQ` | 1352 | 1338 | **0** | 2268 / 0 |
| EC-unsquashed-tampered | 1 | 200 | `msg_011CfLckDts3cSFfRWkrPiBd` | 1294 | 1280 | 0 | 2210 / 0 |
| EC-unsquashed-tampered | 2 | 200 | `msg_011CfLckJgqkcCvsvDWaoAnJ` | 1353 | 1339 | **0** | 2269 / 0 |
| N-no-cue | 1 | **400** | — | — | — | — | 400 |

### OpenRouter (Anthropic pinned)

| variant | call | status | generation id (run 2) | prompt | write | read | run 1 write / read |
| - | - | - | - | - | - | - | - |
| D-control | 1 | 200 | `gen-1790177732-ayvrs8Ax3fOG8LT92eQ9` | 1313 | 1236 | 0 | 2181 / 0 |
| D-control | 2 | 200 | `gen-1790177734-2lmnbYDMAJJ2E9ADwjdp` | 1371 | 0 | **1236** | 0 / 2181 |
| A-squash | 1 | 200 | `gen-1790177736-ODO9MNNIyYWCorIF42nw` | 1313 | 1299 | 0 | 2244 / 0 |
| A-squash | 2 | 200 | `gen-1790177737-x2RrHU8yGxMSDCN6vl8c` | 1371 | 1357 | **0** | 2302 / 0 |
| A2-pair | 1 | 200 | `gen-1790177739-P2b9rEynlA96tCcScew3` | 1332 | 1318 | 0 | 2278 / 0 |
| A2-pair | 2 | 200 | `gen-1790177740-n6GGtkkqdjXu6DtgRfO9` | 1390 | 121 | **1255** | 121 / 2215 |
| B-parts | 1 | 200 | `gen-1790177742-x0EpDOUREXNngheiOtTX` | 1313 | 1299 | 0 | 2244 / 0 |
| B-parts | 2 | 200 | `gen-1790177743-3Y2D6hLHKYu3z3w2FLSy` | 1370 | 57 | **1299** | 57 / 2244 |
| C-unsquashed | 1 | 200 | `gen-1790177745-zrfz7wnxIESJTHzr8btr` | 1313 | 1299 | 0 | 2244 / 0 |
| C-unsquashed | 2 | 200 | `gen-1790177746-Plh6LANYNgzdFPObzUsr` | 1370 | 57 | **1299** | 57 / 2244 |
| CS-product-spelling | 1 | 200 | `gen-1790177754-bLzCrl379LVcQs9QtRZL` | 1332 | 1318 | 0 | not run |
| CS-product-spelling | 2 | 200 | `gen-1790177756-RGsEkwLcMfhjWIcM2tga` | 1389 | 57 | **1318** | not run |
| EB-parts-tampered | 1 | 200 | `gen-1790177747-fJLSolHJIhuHE8pWzqmi` | 1332 | 1318 | 0 | 2278 / 0 |
| EB-parts-tampered | 2 | 200 | `gen-1790177749-YRBfRca9psLB2xx8Biyk` | 1390 | 1376 | **0** | 2336 / 0 |
| EC-unsquashed-tampered | 1 | 200 | `gen-1790177750-j5VYDmZdds4aghCYts2P` | 1332 | 1318 | 0 | 2278 / 0 |
| EC-unsquashed-tampered | 2 | 200 | `gen-1790177752-lGFC40xOyuwiU5lrWvgd` | 1390 | 1376 | **0** | 2336 / 0 |
| N-no-cue | 1 | **400** | — | — | — | — | 400 |

N-no-cue gave the same error on both wires. OR relays it with `provider_name: Anthropic`, request
`req_011CfLcnQuhbYwBFo8fHX4UR`. Verbatim:

```text
400 invalid_request_error: This model does not support assistant message prefill. The conversation must end with a user message.
```

### What OpenRouter sends upstream

These are the echoed `messages`, with long text cut to its head and length. The upstream `system` is
`[{type:"text", text:<the system prompt>}]` on every call.

```text
A-squash call 2: one string, and the marker covers the whole joined block
[{"role":"user","content":[{"type":"text","text":"The chronicle so far:\n[or8-openrouter-1790177732…(3136 chars)"}]},
 {"role":"assistant","content":[{"type":"text","text":"Mara: I set the lantern on the salt-crusted tabl…(327 chars)","cache_control":{"type":"ephemeral"}}]},
 {"role":"user","content":[{"type":"text","text":"[Mara speaks next.]"}]}]

C-unsquashed call 2: we sent TWO assistant messages; OR sent ONE message with two text parts, byte-identical to B-parts call 2
[{"role":"user","content":[{"type":"text","text":"The chronicle so far:\n[or8-openrouter-1790177732…(3136 chars)"}]},
 {"role":"assistant","content":[{"type":"text","text":"Mara: I set the lantern on the salt-crusted tabl…(168 chars)"},
                                {"type":"text","text":"Wren: I lean over her shoulder and squint at the…(157 chars)","cache_control":{"type":"ephemeral"}}]},
 {"role":"user","content":[{"type":"text","text":"[Mara speaks next.]"}]}]

CS call 2: an unmarked plain-string assistant message and a one-part marked one fold into the same two parts;
user strings pass through as strings
[{"role":"user","content":"The chronicle so far:\n[or8-openrouter-1790177732…(3155 chars)"},
 {"role":"assistant","content":[{"type":"text","text":"Mara: I set the lantern on the salt-crusted tabl…(168 chars)"},
                                {"type":"text","text":"Wren: I lean over her shoulder and squint at the…(157 chars)","cache_control":{"type":"ephemeral"}}]},
 {"role":"user","content":"[Mara speaks next.]"}]
```

OpenRouter does not merge content parts, and it does not move the marker. It does fold consecutive same-role
messages into one message, with one text part per source message. No echo carried a key or a header.

### Verdict

- **A (what ships) misses on both wires in both runs.** It reads 0 and writes the whole prefix again every time a
  speaker is appended. This reproduces the lane cache-check's defect with nothing else in the prefix.
- **B and C read the whole prior entry and write only the new speaker** (57/58 tokens), on both wires in both runs.
  The negatives EB and EC read **0**, so the hits are real. The entry is keyed on the exact bytes of M's block, and
  it survives only when that block keeps its boundary.
- **C is B on the wire.** OpenRouter's echo shows the fold. The direct API accepts consecutive assistant messages
  (200) and reads the entry the same way. Its prompt counts one token more than B (1333 against 1332), so the API
  folds them with a separator of its own. CS shows that the product's mixed string and part spelling folds the same way.
- **A2 (moving or doubling the marker) rescues only P.** It reads the user-row entry and writes the joined
  assistant block again (121 tokens). A group of n adjacent speakers is written again in full on every call, so the
  waste grows with the round.
- **The cue is mandatory, and it changes nothing.** sonnet-5 refuses an assistant-last conversation on both wires.
  The cue sits after the marker and differs between the two calls, and every hit above held.

### Recommendation (not built here)

Squash the role, not the text. Keep the adjacency rule in `squashSameRole` and its output of one message per role
group. Change only the merge: the merged row carries each source row as its own text part (layout B) instead of
`join(MERGE_SEPARATOR)`. Then map those parts to text blocks in both runners. Both runners already put a row's marker
on its last part, so the marker lands on the newest speaker's block. The direct runner does this through
`@ai-sdk/anthropic` (in its assistant case, a message-level `cacheControl` goes on the last content part). The
OpenRouter runner does it through `openai-compat/body.ts` rule 9. The depth counter needs no change, because a role
group is still one row.

C (stop squashing adjacent assistant rows) reaches the identical upstream body today. The direct runner's
`@ai-sdk/anthropic` `groupIntoBlocks` folds consecutive assistant messages into one message with one block per
source part, and OpenRouter folds them the same way (see the echo above). C is the smaller code change, but it has
two costs. It contradicts the `strict` role-handling floor Anthropic carries (`curated/anthropic.ts`; D69 homes
role handling on the capability axis). It also makes correctness rest on two folds we do not own, and one of them
is measured but not documented. B keeps the floor's guarantee and does not depend on the wire. Moving the marker
(A2) is rejected, because it caches less and pays a rewrite that grows with the round.

## OR-9 — signed thinking inside a same-role run

**Run:** 2026-09-23. Evidence: `results/or9.jsonl` · probe: `or9-reasoning-in-same-role-runs.ts` · models: `claude-sonnet-5` and `claude-opus-5-5` · wires: Anthropic Messages direct, OpenRouter chat-completions (Anthropic pinned, streamed with `debug.echo_upstream_body`), and OpenRouter's Anthropic-compatible Messages endpoint (`/api/v1/messages`, native blocks, pinned) · thinking adaptive, display summarized · marker `{type:"ephemeral"}` (5m) · prefix about 1.3k tokens · spend **$0.86** OpenRouter (billed, including smoke runs) + ~$0.7 direct (estimated at list prices from 65k input, 22k write, 23k read and 17k output tokens).

The question: the `conversation` reasoning carry puts each stored reply's own signed thinking back on its row. OR-8 settled the layout for text-only runs. Does a layout exist that the wire accepts with real signatures, and that keeps the prior call's cache entry readable?

Each variant generates its own two replies on its own nonce'd prefix. G1 `[P, cueA]` gives reply A with thinking. G2 `[P, A+thA, cueB]` gives reply B with thinking. This is the production shape: the speaker cue is not kept once the speaker replies. Then a two-call pair: call 1 is the run with A, call 2 the run with A and B. Both end on a user cue that differs between the calls.

| variant | call 1 run | call 2 run |
| - | - | - |
| V1 one message, interleaved | `[thA, A*]` | `[thA, A, thB, B*]` |
| V2 thinking on the last reply only | `[thA, A*]` | `[A, thB, B*]` |
| V3 consecutive messages (what F1 emits with the carry on) | `[thA, A*]` | `[thA, A] [thB, B*]` |
| V4 no thinking (carry off) | `[A*]` | `[A, B*]` |
| V5 thinking as text | `["<thinking>…</thinking>A"*]` | `[…A, "<thinking>…</thinking>B"*]` |
| V6 cue kept (append-only history) | `[P, cueA, thA A*, cueB]` | `[P, cueA, thA A, cueB, thB B*, cue]` |
| X tampered | V1 with one byte of thA's signature changed | same |

On the direct wire, each Opus pair also ran with the `thinking-binding-controls-2026-08-01` beta and `prefix_mismatch_behavior: "error"`, which enforces the prefix check on any account.

### Call 2: status and cache read

| variant | direct sonnet-5 | direct opus-5-5 | direct opus-5-5, binding enforced | OR sonnet-5 | OR opus-5-5 | OR Messages sonnet-5 | OR Messages opus-5-5 |
| - | - | - | - | - | - | - | - |
| V1 | 200, read 1375 | 200, read 1431 | **400** (call 1 already) | **400** | **400** | **400** | **400** |
| V2 | 200, read **0** | 200, read **0** | **400** | 200, read **0** | 200, read **0** | 200, read **0** | 200, read **0** |
| V3 | 200, read 1392 | 200, read 1600 | **400** (call 1 already) | 200, read 1397 | 200, read 1367 | 200, read 1353 | 200, read 1506 |
| V4 | 200, read 1309 | 200, read 1346 | 200, read 1445 | 200, read 1319 | 200, read 1330 | 200, read 1313 | 200, read 1330 |
| V5 | 200, read 1366 | 200, read 1445 | 200, read 1601 | 200, read 1407 | 200, `content_filter` | 200, read 1370 | 200, read 1386 |
| V6 | 200, read 1396 | 200, read 1555 | 200, read 1856 | 200, read 1396 | 200, read 1574 | 200, read 1459 | blocked (refusals) |
| X | **400** | **400** | **400** | **400** | **400** | **400** | **400** |

Every accepted call 2 that read the entry wrote only the new speaker (71 to 398 tokens). Replies were sane: each named the odd number and added a reason in the named speaker's voice. A cell whose reply was a classifier refusal still shows the request's cache numbers.

The errors, verbatim:

- **V1 on both OpenRouter endpoints:** `messages.1.content.1: \`thinking\` or \`redacted_thinking\` blocks in the latest assistant message cannot be modified. These blocks must remain as they were in the original response.`
- **V1/V2/V3 with binding enforced (Opus 5.5):** `messages.1.content.0: Invalid \`signature\` in \`thinking\` block. The block is bound to a different conversation. Remove the block, or set \`thinking.block_binding.prefix_mismatch_behavior\` to "drop_block". Content that preceded this block when it was created is missing from this request, starting at \`messages.0.content.0\`.`
- **X on every wire:** `messages.1.content.0: Invalid \`signature\` in \`thinking\` block`.

### What OpenRouter sends upstream

The chat-completions echo shows the cause of the V1 400. OpenRouter carries thinking as `reasoning_details` on the message and hoists all of it to the head of the upstream message. V1 therefore goes up as `[thA, thB, A, B*]`, and two thinking blocks from two different responses sit next to each other. The direct wire keeps our order, `[thA, A, thB, B*]`, where each thinking block precedes its own reply, and the API accepts it. OpenRouter's Messages endpoint refuses V1 with the same error, so it goes through the same conversion.

V3 is accepted on OpenRouter because OpenRouter folds the two consecutive assistant messages into one message and keeps only the first reply's thinking. The echo for call 2 is `assistant: [thinking, text, text*]` on both models. B's thinking never reaches the model, and nothing says so.

### Documentation read for V6 and the binding pass

From the Claude thinking and preserved-thinking docs (`platform.claude.com/docs/en/build-with-claude/thinking`, `…/preserved-thinking`):

- Outside tool use, omitting prior turns' thinking is allowed. Opus 4.5 and later, Sonnet 4.6 and later, and the Fable and Mythos models keep prior turns' thinking in context. Earlier models strip it.
- Within the latest assistant message, consecutive thinking blocks must match what the model generated. This is the rule V1 breaks on OpenRouter.
- On Opus 5.5 and Fable 5.1, a thinking block is valid only while the system prompt, the tools and every message before it are unchanged. Deleting or rewording a turn-scoped message is an edit. Accounts created on or after 2026-08-31 enforce this by default; older accounts enforce it only when `prefix_mismatch_behavior` is set. This account is older: the unenforced Opus pass returned 200.
- Adding, moving or removing `cache_control` markers is not an edit.

### Verdict

- **Carry off (V4) works on every wire and model.** It is OR-8's layout B, and it is what F1 builds.
- **Direct wire, carry on:** V1 and V3 are both accepted and both read the prior entry. The direct runner's `@ai-sdk/anthropic` `groupIntoBlocks` turns F1's consecutive rows into V1.
- **OpenRouter, carry on:** only V3 is accepted, and OpenRouter silently drops every reply's thinking after the first in the run. V1 is a hard 400 on both endpoints.
- **Dropping earlier thinking (V2) costs the whole cache entry:** the prefix changes at A's block, so call 2 reads 0 on every wire.
- **Signatures are checked on every wire (X).** Thinking as plain text (V5) is accepted and caches, but it is unsigned, and it drew one `content_filter` on Opus.
- **Under prefix binding, no same-role run with carried thinking survives.** SHAPE's per-speaker cue is not stored, so it is missing on the next call, and every thinking block after it is "bound to a different conversation". The same holds for any turn-scoped row SHAPE adds and then drops, such as the continuation cue. Only V6, which keeps the cue in the history, is accepted with enforcement on.
- **Classifier noise (not a layout effect).** On Opus 5.5 a "group role-play" system prompt and the kit's toll-ledger filler were refused outright (`stop_reason: "refusal"`, zero output), and even the neutral prompt was refused on 28 of 50 first generations across the three wires. The refusal rate did not rise when the history carried thinking (24 of 63), so the probe reads it as prompt sensitivity.

### Recommendation (not built here)

1. **Keep F1 as committed.** Carry off, it gives each speaker its own block on every wire (V4). Carry on, the direct wire gets V1 through the SDK's fold, and OpenRouter gets V3.
2. **Do not fold reasoning-bearing rows in `openai-compat/body.ts`.** Rule 10 already refuses them, and a fold would produce V1, which OpenRouter refuses.
3. **Record OpenRouter's thinking drop.** With the carry on, OpenRouter keeps only the first reply's thinking in a same-role run. That is a wire fact for the carry's docs, not a defect F1 can fix.
4. **The carry on Opus 5.5 and Fable 5.1 needs an append-only history.** For new accounts this is a hard 400 today in any cued group round. The documented fixes are to keep the turn-scoped row in place (a stored cue, V6) or to send it as a turn-scoped mid-conversation system message and leave it in place. This is an owner design question.

## OR-10 — the reasoning carry under prefix binding

**Run:** 2026-09-23. Evidence: `results/or10.jsonl` · probe: `or10-carry-prefix-binding.ts` · models: `claude-opus-5-5` and `claude-fable-5-1` (the two that bind thinking to its prefix) · wires: Anthropic Messages direct, plus OpenRouter's `/api/v1/messages` for the pass-through check · betas `thinking-binding-controls-2026-08-01` and `mid-conversation-system-clear-at-2026-08-21` · thinking adaptive at effort high · top-level automatic caching (5m) · prefix about 900 tokens · spend **$0.07** OpenRouter (billed) + about $0.6 direct (estimated at list prices from 43k write, 49k read and 10k output tokens).

The question: with the `conversation` carry on, every prior assistant turn goes back exactly as returned, thinking included. On these two models a thinking block is valid only while the system prompt, the tools and every message before it are unchanged. This account predates default enforcement, so every call opts in by setting `thinking.block_binding.prefix_mismatch_behavior`. Each scenario is a 3-to-4-call session run once with `"error"` and once with `"drop_block"`. An `"error"` session stops at its first refusal.

| scenario | what moves between calls |
| - | - |
| S1 | group round; the speaker cue is an ordinary user row that is gone on the next call (what the product does) |
| S2 | one speaker per user message; the cue is a turn-scoped system message (`clear_at: "next_user_message"`) left in place |
| S2b | two speakers with no user message between; the second cue is a turn-scoped system message right after the first reply |
| S2c | two speakers per round; each cue is an ordinary user row kept in the history |
| S3 | author's note at depth 4 as an ordinary user row that moves every turn (what the product does); under `drop_block` this is also S5 |
| S4 | the same note at depth 0 as a turn-scoped system message appended every turn and left in place |
| S6 | a lore line in the top-level system prompt changes on call 3 |

### Results (direct; the same on both models unless noted)

| scenario | `"error"` | `"drop_block"`: dropped blocks | cache read across the session |
| - | - | - | - |
| S1 cue deleted | **400 on call 2** | every earlier reply's block, growing each call (call 4 drops 3 on opus) | **0 on every call** |
| S2 cue turn-scoped | clean, 4 calls | none | grows: 923, 1056, 1149 (opus) · 923, 1373, 1444 (fable) |
| S2b cue after a reply | **400 on call 2**: `messages.3: role 'system' must follow a 'user' message or an 'assistant' message ending in a server tool result` | same 400 | none |
| S2c cue kept as a user row | clean, 4 calls | none | grows: 933, 1044, 1374 (opus) · 933, 1226, 1335 (fable) |
| S3 depth-4 note moving | **400 on call 2** | only the block right after the note's new position (fable: `messages.2` on calls 2 and 3, `messages.4` on call 4) | below the note only: 893, 988, 893 (fable) |
| S4 depth-0 turn-scoped note | clean, 4 calls | none | grows: 893, 1033, 1197 (opus) · 893, 1119, 1189 (fable) |
| S6 system edit on call 3 | **400 on call 3** | every block in the history | **0 on call 3**, full rewrite; call 4 reads again |

The binding error, verbatim: `messages.1.content.0: Invalid \`signature\` in \`thinking\` block. The block is bound to a different conversation. Remove the block, or set \`thinking.block_binding.prefix_mismatch_behavior\` to "drop_block". …`. Under `drop_block` each drop is listed in `input_transformations` as `{"type":"thinking_dropped","path":"messages.N.content.0","reason":"prefix_binding_mismatch"}`, and every such request returned 200 with a coherent reply. The model answered each puzzle correctly without its dropped reasoning. What it loses is the earlier reasoning itself, and with it the cache below the first dropped block.

**The note is followed either way.** The canary ("end your reply with the word lantern") appeared in every coherent reply from call 2 on in both S3 and S4. A depth-0 turn-scoped note steers the model as well as a depth-4 row.

**S2b's question about earlier cues.** The placement rule makes it moot: a system message may not follow a reply. Per the docs, a turn-scoped message renders until the next user message, so without one it would stay visible.

**OpenRouter's Messages endpoint passes all of it through.** S1 and S2 on opus returned the same results: the binding 400, `input_transformations` drops, and `clear_at` accepted with the beta header. The one difference is that OpenRouter omits an empty `input_transformations` array.

**Refusals.** `claude-opus-5-5` returned `stop_reason: "refusal"` on 12 of 42 direct calls and 3 of 13 OpenRouter calls, even with the neutral prompt. `claude-fable-5-1` refused on 1 of 42. A refused reply leaves that cell's cache numbers valid but its reply empty.

### Recommendation (not built here)

Make every per-turn row append-only on these models. Each row below replaces something the product deletes or moves today.

1. **Speaker cues.** SHAPE rebuilds the cue before every assistant row whose author follows another reply, and keeps it in every later call. The cue is derived only from the stored row's author, so every call rebuilds it byte for byte. This is S2c, clean and cached. It also removes same-role adjacency from group rounds. The first speaker after a real user message may use a turn-scoped system cue (S2). A later speaker in the same round may not, because a system message cannot follow a reply (S2b).
2. **Continue and impersonate nudges.** They have the same shape as a cue: a row SHAPE adds for one call. Keep the nudge as a stored row after the turn it produced, or send it turn-scoped where it follows a user row. A continue also rewrites the stored reply it extends. Its thinking was not measured here, so leave the carry off for that row until a probe measures it.
3. **Depth-N injections.** A row that moves every turn is an edit. Under `drop_block` it costs the blocks after it and the cache below it on every turn. Send author's notes, world-info at depth and similar as turn-scoped system messages at depth 0 (S4). They steer the model as well, keep the cache growing, and keep every block valid.
4. **System-region per-turn content** (fired lore, memory, the dynamic half). Any edit to the top-level system prompt drops every block and the whole cache (S6). Move the volatile part into a turn-scoped system message at the tail, following the last user message. The product already has a message-tail channel and a `clearAt` field for this. Keep the top-level system prompt static for the session.
5. **When to set `drop_block`.** Always, on a binding model with the carry on. `"error"` turns any missed edit into a failed turn; `drop_block` turns it into lost reasoning on that turn. Record `input_transformations` and alarm on any `prefix_binding_mismatch`. After the changes above it should be zero, so a drop marks a new edit to find.

---

## OR-11 — a depth-2 system row: obeyed or only accepted

**Run:** 2026-09-24. Evidence: `results/or11.jsonl` · probe: `or11-depth-system-obedience.ts` · wire: Anthropic Messages direct · models: `claude-sonnet-5`, `claude-opus-4-8`, and `claude-opus-5-5` as the control that obeys a tail system row · thinking adaptive at effort low · spend about $0.08 direct (estimated at list prices from 4.6k input and 3.1k output tokens), no OpenRouter spend.

The question: sonnet-5 and opus-4-8 accept a tail system row and ignore it, so `midConversationSystem` is false for them. `historySystemRows` stays true for them, so a depth-N system row in its legal slot still goes out as `system`. Only the 200 was measured, not whether they obey it.

Constant: top-level system prompt, `u1` (a houseplant question), a fixed `a1` reply, `u2` (how long to boil an egg). The note is "Standing instruction: from now on, end every reply with the single word LANTERN." Honoured means the reply ends with `LANTERN`. Mover: how the note reaches the wire.

| arm | the note on the wire |
| - | - |
| `system` | a `system` row between `u1` and `a1`: `[u1, S, a1, u2]`, what `historySystemRows: true` sends |
| `folded` | user text in the product's fold frame (`chat.injection.systemNote`), a second text block on `u1` (leg 2's placement `a`; SHAPE itself merges the note into `u1`'s text, placement `b`) |

### Results (every call 200)

| model | `system` honoured | `folded` honoured |
| - | - | - |
| sonnet-5 | **5/6** (one smoke call plus five trials) | 1/5 |
| opus-4-8 | **5/5** | 0/5 |
| opus-5-5 (control) | 5/5 | 5/5 |

Request ids, in trial order:

- sonnet-5 `system`: `req_011CfNXQZmZTRoQtXrNmjd1p` (smoke), `req_011CfNXR4GKK4kk4M38AEE5h`, `req_011CfNXR9V6crWDai7bkDQFS`, `req_011CfNXRNjp8NaqVVdjszyDJ`, `req_011CfNXRezNQVL5i3uQypeZ1` (missed), `req_011CfNXRooSzZE3SjvnUwbbY`
- sonnet-5 `folded`: `req_011CfNXRyS8WqpUeD4GsBQud`, `req_011CfNXS7NsbZz2qHWwXpRSa`, `req_011CfNXSFAw1dLBkmDAijenn` (honoured), `req_011CfNXSQ5TdRuhrdRWvUsqh`, `req_011CfNXSWr1DCjW8qZunFZjk`
- opus-4-8 `system`: `req_011CfNXSh1w73PuN9rFBMZ1W`, `req_011CfNXSr9ra9eCG79nHjMfc`, `req_011CfNXT18cFSH7ae3EjzS5v`, `req_011CfNXTALVwjPYeDBjDuu9h`, `req_011CfNXTJuBr5AAY42bdNtr9`
- opus-4-8 `folded`: `req_011CfNXTSRdEdL227Mp2YaLR`, `req_011CfNXTa4WYwT1B6eBW57Ck`, `req_011CfNXTiF8jELCnXmjP6RQR`, `req_011CfNXTrJKbE3FVVisBsGZL`, `req_011CfNXTzfc25LE7tptuKnQf`
- opus-5-5 `system`: `req_011CfNXU8pF5RGPWKi63ZvEu`, `req_011CfNXUKHXsrDKLq7nDgXQ1`, `req_011CfNXUWeexLaSu2pm2C43s`, `req_011CfNXUjVpH6UgZaCDfRMVu`, `req_011CfNXUuzMHUCw9svhU1SPK`
- opus-5-5 `folded`: `req_011CfNXV5Z4jHigetQPwLpQx`, `req_011CfNXVGWP9jvCYpnwNxXWY`, `req_011CfNXVUhMm6D1UFhBek6Qt`, `req_011CfNXVfU1Q1dGgkHFaEzEm`, `req_011CfNXVsBhgcAUQ6VWBCTjV`

### Verdict

The premise is refuted. sonnet-5 and opus-4-8 obey a depth-2 system row in its legal slot as well as the control does. The fold is the weaker delivery on both: as user text in the earlier turn they mostly ignore the note. Only opus-5-5 follows it either way.

The tail row and the depth row are separate facts. A system row after the latest user turn is ignored on these two models (the `TAIL_SYSTEM_MODELS` evidence); a system row before an assistant reply is obeyed.

### Consequence

`historySystemRows: true` and the `slotted` floor stay on sonnet-5 and opus-4-8 on the direct wire. Setting it false would fold depth notes into the user text these models ignore. The curated row's cite now carries this evidence. OpenRouter was not probed here; its row rests on OR keeping a legal-slot system row in place upstream (SHAPING-MATRIX §7).

### Leg 2: which fold carries the note

**Run:** 2026-09-24, same probe, same constant. 900 calls, all 200, estimated $1.79 at list prices (sonnet-5 $2/$10, opus-4-8 $5/$25, opus-5-5 $4/$20 per million input/output tokens, from OpenRouter's models API). Rows carry `leg: 2` in `results/or11.jsonl` with every request id.

Movers:

- Note: `standing` is the leg-1 note. `next` is "End your next reply with the single word LANTERN.", worded as a guided steer is.
- Placement: `a` a separate text block after `u1`; `b` merged after `u1`'s text with a blank line (what SHAPE sends today, see "Where the fold is chosen"); `c` merged before `u1`'s text; `d` a separate text block after the latest user message `u2`; `e` merged after `u2`'s text.
- Frame: `consideration` is `chat.injection.systemNote` (`[Take the following into special consideration: …]`); `guided` is `preset.guided.response` and `chat.injection.assistantNote` (`[Take the following into special consideration for your next message: …]`); `ooc` is `[OOC: …]`, the prefix of the preset's guided rewrite and continue slots; `systemNote` `[System note: …]`, `xml` `<system_note>…</system_note>` and `bare` (the note alone) are candidates, not product frames.

Every cell is 5 trials. The finalists (`b`, `c`, `d` with `consideration` and `bare`) got 10 more, so they read out of 15.

`standing` note, sonnet-5 · opus-4-8:

| placement | `consideration` | `guided` | `ooc` | `systemNote` | `xml` | `bare` |
| - | - | - | - | - | - | - |
| `system` (control, bare note) | 3/5 · 5/5 | | | | | |
| `a` | 4/5 · 0/5 | 5/5 · 0/5 | 2/5 · 4/5 | 1/5 · 0/5 | 1/5 · 0/5 | 2/5 · 1/5 |
| `b` | 9/15 · 10/15 | 2/5 · 1/5 | 1/5 · 1/5 | 1/5 · 0/5 | 4/5 · 0/5 | 7/15 · 15/15 |
| `c` | 4/15 · 2/15 | 3/5 · 5/5 | 1/5 · 4/5 | 0/5 · 0/5 | 2/5 · 0/5 | 12/15 · 15/15 |
| `d` | 12/15 · 15/15 | 2/5 · 3/5 | 1/5 · 5/5 | 1/5 · 0/5 | 0/5 · 5/5 | 11/15 · 13/15 |
| `e` | 4/5 · 4/5 | 0/5 · 5/5 | 1/5 · 5/5 | 0/5 · 0/5 | 0/5 · 5/5 | 4/5 · 5/5 |

`next` note, sonnet-5 · opus-4-8:

| placement | `consideration` | `guided` | `ooc` | `systemNote` | `xml` | `bare` |
| - | - | - | - | - | - | - |
| `system` (control, bare note) | 5/5 · 2/5 | | | | | |
| `a` | 1/5 · 0/5 | 0/5 · 0/5 | 0/5 · 4/5 | 2/5 · 0/5 | 2/5 · 2/5 | 3/5 · 3/5 |
| `b` | 0/15 · 0/15 | 0/5 · 0/5 | 0/5 · 0/5 | 0/5 · 0/5 | 0/5 · 0/5 | 0/15 · 12/15 |
| `c` | 0/15 · 13/15 | 0/5 · 5/5 | 1/5 · 2/5 | 4/5 · 5/5 | 5/5 · 2/5 | 9/15 · 15/15 |
| `d` | 15/15 · 15/15 | 5/5 · 5/5 | 5/5 · 5/5 | 5/5 · 3/5 | 5/5 · 5/5 | 15/15 · 15/15 |
| `e` | 5/5 · 5/5 | 3/5 · 5/5 | 5/5 · 5/5 | 5/5 · 0/5 | 5/5 · 5/5 | 5/5 · 5/5 |

opus-5-5 control on the finalists (5 trials each): `standing` 5/5 on `c/consideration`, `c/bare`, `d/consideration`, `d/bare`; `next` 5/5 on `d/consideration` and `d/bare`, 0/5 on `c/consideration` and `c/bare`.

Sample request ids (first and last trial of a cell): today's `b/consideration` standing sonnet-5 `req_011CfNagYicJ8u4DZgL3zieo` … `req_011CfNcAVbywmdSy9BnoZhYn`; `d/consideration` standing sonnet-5 `req_011CfNb1g9cesANnPoAKePRT` … `req_011CfNcMVKR94osvZbJ91X8b`, opus-4-8 `req_011CfNb2LArbP6L3b4U89sr7` … `req_011CfNcNsdsgydyyBE2hYSFz`, opus-5-5 `req_011CfNcBcSX3vwYcJgbBecBw` … `req_011CfNcCPbsn5wAi2sgKQVui`; `d/consideration` next sonnet-5 `req_011CfNbpi8F771P1PhojjJtj` … `req_011CfNcgna2h648GUEoquxWE`, opus-4-8 `req_011CfNbqJUxuXvcb2W5yDYak` … `req_011CfNciURBW24KbLgfrWpn4`.

### Leg 2 verdict

1. **Placement matters more than the frame.** A note attached to the latest user message as its own block (`d`) is followed on every model with the current frame: standing 12/15, 15/15, 5/5; next 15/15, 15/15, 5/5. Today's fold (`b`, the same frame) carries a standing note 9/15 and 10/15 and a next-reply note 0/15 on both.
2. **At depth 2, a next-reply note is correctly not followed.** In `a`, `b` and `c` "your next reply" names `a1`, which already exists; opus-5-5 reads it that way (0/5 on `c`). So a steer worded for the next reply only works at the latest user message.
3. **Keeping depth 2, the only strong fold is the bare note before the user text (`c/bare`):** standing 12/15, 15/15, 5/5. The same position with the current frame is the worst finalist (4/15, 2/15). A bare note reads as the user's own words, which is why it works and why it loses the operator framing.
4. **Frames that claim system authority in user text fail on sonnet-5.** `[System note: …]` is at most 1/5 on sonnet-5 for a standing note in every placement, and `<system_note>` 0/5 at `d` and `e`. `ooc` is weak on sonnet-5 for a standing note (1/5 at `d`). `consideration` and `bare` are the consistent frames.
5. **The system row stays the right channel where the model takes it.** Standing via `system`: sonnet-5 8/11 across both legs, opus-4-8 10/10. It is about as strong as `d` and stronger than every fold that keeps the note at its depth, except `c/bare`.

### Leg 2 recommendation (not built here)

- **Per-model flag:** no change. `historySystemRows` stays true on sonnet-5 and opus-4-8. Today's fold is worse than their system row.
- **The fold path, for a model with `historySystemRows` false:** send the folded note as its own text block on the latest user message, with the current `chat.injection.systemNote` frame (placement `d`). This moves a depth-N note to depth 0, which is an owner decision. Two costs: the note's author depth no longer applies, and the previous turn's latest user message loses its note on the next call, so the history above it changes each turn (OR-10: a moving row costs the cache below it, and on a binding model the thinking after it).
- **If the depth must stay:** put the note before the user text with no frame (`c/bare`). It is the only depth-keeping fold that works on both models, but it reads as the user's own words.
- **Do not use** `[System note: …]` or `<system_note>` as a fold frame.

### Where the fold is chosen

- The frame: `foldEntry` in `packages/server/src/domain/chat/assembly/shape.ts:236`, which calls `frameInjection("user", …, "system", …)` at `shape.ts:237`. `frameInjection` (`packages/server/src/domain/chat/assembly/injections.ts:61`) picks the slot through `RE_ROLED_FRAME` (`injections.ts:32`); the text is `chat.injection.systemNote` in `packages/contracts/src/chat/prose.ts:303`.
- The position: `foldMidArrayRuns` (`shape.ts:293`, called at `shape.ts:329`) folds each mid-array system row in place, at the depth the splice gave it. The trailing run folds at `shape.ts:335`.
- The merge into the user text: the squash at `shape.ts:555` runs `squashSameRole` over `squashRuns` (`packages/server/src/domain/chat/assembly/role-squash.ts:37`). With `canonApart` an injection still joins the stored row beside it, joined with `MERGE_SEPARATOR` (`role-squash.ts:21`, a blank line). That makes today's wire placement `b`.

### Leg 3: haiku-4-5, where the fold runs

**Run:** 2026-09-24, same probe and constant, `OR11_LEG=3`. `claude-haiku-4-5-20251001` direct, thinking `enabled` with `budget_tokens: 1024` (it takes no adaptive thinking or effort). 141 calls, all 200, estimated $0.20 at list prices ($1/$5 per million). haiku-4-5 400s any system row, so it has no `system` control; every note it gets is a fold. Rows carry `leg: 3` in `results/or11.jsonl`. 10 trials a cell; the first `standing b/consideration` call was a smoke call, so that cell reads out of 11.

| placement / frame | `standing` | `next` |
| - | - | - |
| `b/consideration` (the fold before this change) | 0/11 | 2/10 |
| `b/bare` | 1/10 | 6/10 |
| `c/consideration` | 0/10 | 9/10 |
| `c/bare` (the shipped depth-N fold) | 0/10 | **10/10** |
| `d/consideration` | 0/10 | |
| `d/bare` | 0/10 | |
| `e/consideration` (the trailing fold before this change) | 0/10 | 6/10 |
| `e/bare` (the shipped trailing fold) | 0/10 | 9/10 |

Sample request ids (first and last trial): `b/consideration` next `req_011CfNeieXsbdcbFbk5Qokgd` … `req_011CfNemAPnU1HczRZQ1F7MP`; `c/bare` next `req_011CfNequm73NFZ9tBhNJB4g` … `req_011CfNesR1XeUbHdjsV1pWHb`; `e/bare` next `req_011CfNeucmGLBjWEuA3ehruY` … `req_011CfNew5kWhdRxLA9ALEKsY`; `d/bare` standing `req_011CfNeyao4QNxrejAuo4D2k` … `req_011CfNf1Q9AZhNfDBw6cKzbf`.

**Verdict.** haiku-4-5 improves under the shipped fold and loses nothing. A next-reply note goes from 2/10 to 10/10 at depth 2 and from 6/10 to 9/10 at the tail. haiku-4-5 follows no standing note in any user-text placement, the latest message included (`d` 0/10 with either frame), so no fold placement fixes that; it is the model, not the fold. At depth 2 haiku-4-5 follows a next-reply note that names a reply already given, which opus-5-5 declines (leg 2); the probe counts it as honoured.

### Shipped

SHAPE sends a folded system note bare (`frameInjection` gives a re-roled system note no frame, and the `chat.injection.systemNote` slot is deleted). A fold inside the history moves up to just before the first stored row of the user text above it, so it leads the user message it joins at its own depth (`leadUserText` in `packages/server/src/domain/chat/assembly/shape.ts`); a row assembly made above it, such as the new-chat marker, keeps its place. A trailing fold stays after the latest user text: `e/bare` is measured and carries, and a note placed before the latest user text was never measured. Models with `historySystemRows: true` keep real system rows.
