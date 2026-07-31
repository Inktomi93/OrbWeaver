# rpg-extraction coverage probe

Throwaway spike harness behind the one-call-tools decision. Full writeup:
[`docs/design/rpg-extraction-one-call-spike.md`](../../../docs/design/rpg-extraction-one-call-spike.md).

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
`out/`, `out2/`, `out2-medium/` hold the results — gitignored, so they live on disk only. Everything here
was recovered from a session scratchpad on 2026-07-30; don't let it drift back to `/tmp`.
