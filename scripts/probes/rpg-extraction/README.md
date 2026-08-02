# rpg-extraction coverage probe

Throwaway spike harness behind the one-call-tools decision. Full writeup:
[`docs/design/rpg-extraction-one-call-spike.md`](../../../docs/design/rpg-extraction-one-call-spike.md).

**ARCHIVED 2026-08-02 — pre-R2R3 vocabulary.** `real-cheap-toolround.json`, `real-reliable-structured.json`,
and `captures.json` all carry the retired `hpDelta`/`setHp` party vocab (pre-actor-state-reshape). Kept
as historical measurement records — do NOT run against the current contracts (the actor-state reshape
retired this vocab; see `run-coverage.mjs`/`run.mjs`/`native-wire-probe.mjs`/`native-format-roundtrip.mjs`,
similarly archived) — mint fresh corpora instead. The corpora files themselves are untouched.

`run-coverage.mjs` — plays a fixed 8-turn game through the `1call-tools` shape (GM persona + the 7 real
rpg tools + `tool_choice:"auto"`) TWICE: Arm A = terse tool descriptions, Arm B = enriched
"when-to-use + example" descriptions. Emits a per-field coverage matrix (which tracked fields the model
populates, terse vs enriched) to `out2/`.

**⚠️ Live spend.** Hits OpenRouter (`anthropic/claude-sonnet-5`), ~16 calls, ~$0.30/run. Reads
`OPENROUTER_API_KEY` from the repo `.env` (never printed). `out2/` outputs are gitignored.

Run: `node scripts/probes/rpg-extraction/run-coverage.mjs`

Env knobs (added for the §4a reasoning sweep — all optional):

| var | default | effect |
|---|---|---|
| `SPIKE_ARMS` | `A,B` | run a subset. `B` alone = 8 calls (~$0.15) instead of 16 |
| `SPIKE_EFFORT` | `none` | reasoning effort — `low`/`medium`/`high`/`xhigh`/`max` |
| `SPIKE_OUT` | `out2` | output dir, so a sweep doesn't clobber the committed baseline |
| `SPIKE_GAME` | `sanctified` | `afflictions` = the 12-turn F1 game with **ground truth** (5 scripted condition retirements, 4 damage beats). ~$0.22/run |
| `SPIKE_NUDGE` | `off` | `think` / `reconcile` — per-message steering, applied only on turns where a condition is active. Tested, no effect (R4a) |

```sh
# the §4c decisive test — ground-truth recall for removeCondition / hpDelta
SPIKE_GAME=afflictions SPIKE_ARMS=B SPIKE_EFFORT=none SPIKE_OUT=f1-none-1 \
  node scripts/probes/rpg-extraction/run-coverage.mjs
```

On the `afflictions` game the run prints a `GROUND TRUTH:` line — `removeCondition hits/expected` plus
spurious count, and `hpDelta hits/expected`. **Read that, not the `/12` column.** Caveat: the harness
`ensure`s a condition by *our* name while the model tracks its own, so a retirement of e.g.
`Feverish Sickness` where truth says `Poisoned` scores as a miss + a spurious. Check the per-turn `truth`
block before believing a miss.

```sh
# the §4a run: enriched arm, medium reasoning, beside the baseline
SPIKE_ARMS=B SPIKE_EFFORT=medium SPIKE_OUT=out2-medium node scripts/probes/rpg-extraction/run-coverage.mjs
```

`real-cheap-toolround.json` is the real captured production tool-round body (the 7 tools + arg schemas);
the harness swaps only each tool's `description` between arms.

`run.mjs` is the **method-matrix** harness behind §3 (7 methods: 1-call vs 2-call × tools vs strict-lean
schema × reasoning none/high). `replay-toolround.mjs` is the required-vs-auto content probe.

Two **native-wire** probes hit Anthropic's Messages API directly (`ANTHROPIC_API_KEY`, not OpenRouter) to
answer §2 questions the OpenAI-compat wire can't express. They print and write nothing:

| probe | answers | ~cost |
|---|---|---|
| `native-wire-probe.mjs` | tools × `output_config.format` × `thinking:{adaptive}` on the native wire | $0.03 |
| `native-format-roundtrip.mjs` | does the schema land on the final text turn after a `tool_result`? (**yes**) | $0.01 |
`card-teach-probe.ts` is the **F2** harness (§4h) — a 10-turn scene of pure card OPPORTUNITIES, the real
`buildLiteReminder` with only the card-teach block swapped per arm (A–H), scored twice: `emitted` (a `:::card`
line in the text) vs **`rendered`** (a `card` span out of the production tokenizer). That split is the whole
finding — Sonnet emits 95%, we render 73%, the gap is a malformed open fence we silently drop.

| var | effect |
|---|---|
| `CARD_ARMS` | subset, default `A,B,C,D,E` (`F`/`G`/`H` are opt-in) — one arm ≈ $0.18 |
| `CARD_OUT` | transcript path (default `card-teach-out.json`, gitignored) |
| `CARD_DRY=1` | print each arm's assembled injection and exit — **no spend** |
| `CARD_SCORE=<file>` | re-score a saved transcript with the current scorer — **no spend** |

Sampled outputs: `CARD-TEACH-SAMPLES.md`.

`out/`, `out2/`, `out2-medium/` hold the results — gitignored, so they live on disk only. Everything here
was recovered from a session scratchpad on 2026-07-30; don't let it drift back to `/tmp`.
