# impersonate anti-bleed probe (IMP-1)

Measures whether the production impersonate voice-lock nudge holds — does the model write the USER's next
line, or does it slip back into the character's voice? Read the findings first:
[`RESULTS.md`](RESULTS.md). Full transcripts + judge verdicts: `results.jsonl` (committed).

The request for each fixture is assembled by the SERVER'S OWN code (`buildPrompt` → `resolveNudgeText` →
`shapeTurn`, through `substrate/assembly-access`) — only the HTTP call is hand-rolled. See `prompt.ts` for
the two production steps deliberately skipped and why.

```sh
node scripts/probes/impersonate/run.ts          # local arm, 12 fixtures x 3
IMP_ARMS=hosted node scripts/probes/impersonate/run.ts
IMP_JUDGE=1 node scripts/probes/impersonate/run.ts   # blind who-is-speaking pass
IMP_DRY=1 node scripts/probes/impersonate/run.ts     # print prompts, no spend
```

**⚠ Live spend on the hosted arms.** The local arm needs the vLLM gen engine awake (your own launcher's wake verb,
truth = `GET /is_sleeping`); it costs nothing. The hosted arm + the judge hit OpenRouter (key from the env
or the repo `.env`, never printed): a full run is 12 generations + one judge call per sample, cents.

| env | default | effect |
|---|---|---|
| `IMP_ARMS` | `local` | comma list: `local`, `hosted` |
| `IMP_SAMPLES` | 3 local / 1 hosted | generations per fixture |
| `IMP_FIXTURES` | all | comma list of fixture ids |
| `IMP_LAYER` | `off` | `on` = send the IMP-1 char-name stop set on the wire |
| `IMP_OUT` | `results.jsonl` | results path (resumable — completed samples are skipped) |
| `IMP_LOCAL_URL` | `http://127.0.0.1:8703` | the vLLM generation engine |
| `IMP_HOSTED_MODEL` | `openai/gpt-4.1-mini` | the hosted arm's model |
| `IMP_JUDGE` / `IMP_JUDGE_MODEL` | — / `anthropic/claude-sonnet-5` | the blind judge pass |
| `IMP_DRY` / `IMP_SCORE_ONLY` | — | print prompts / re-score saved results (no spend) |

Resumable: each completed `(arm, layer, fixture, sample, model)` lands in the results file immediately and
is skipped on a re-run. Delete the file (or set `IMP_OUT`) for a clean measurement. The judge verdict is
stamped with a prompt version, so editing the judge prompt re-judges instead of mixing two rubrics.

**The mechanical flags in `score.ts` are NOT the verdict** — they miss a first-person character takeover
entirely (measured). The judge is. See `RESULTS.md` §scoring.
