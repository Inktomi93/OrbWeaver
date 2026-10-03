# Speaker-pick probe (work item 0420)

What does each way of picking the next speaker in a per-speaker group room cost, and how good is its pick?
Read the findings first: [`RESULTS.md`](RESULTS.md).

## What runs

The fixtures (`fixtures.ts`) are five synthetic four-character rooms, each one continuous scene with six
decision points (30 cuts). At each cut the window is the trailing ten lines, each under its speaker's name,
which is what `turn.ts::arbiterTranscript` hands the arbiter. Each cut has a kind (named by the user, named by
another character, addressed by role, a reply to the last line, or an open floor) and a hand judgment of who
may plausibly speak next (`accept`, null on an open floor).

The arms reuse production code wherever the production path exists:

| arm | what it calls |
| - | - |
| `natural` | `selectSpeakers` with policy `natural` and the human trigger's plain-word mentions, as `turn.ts` sends them. Random, so the report gives its expected agreement over 4,000 seeded draws per cut. |
| `natural-any-mention` | the same, with the mentions resolved from the trigger whoever wrote it. |
| `arbiter-<model>` | `smartArbitrate` itself, with the shipped `chat.arbiter.system` prompt, the `arbiter` side-gen posture (temperature 0.2, 24 output tokens), the roster-validating parse and the `natural` fallback. Only the `summarize` op is the probe's: an OpenRouter or llama.cpp chat completion. |
| `rerank-<cores>-<variant>` | the local-light `createModelCache().scorePairs` over `Xenova/ms-marco-MiniLM-L-6-v2`, the op the shipped rerank task calls. Documents are `Name: persona`. Variants: `window` (query = the ten-line window), `trigger` (query = the last line), `trigger-banlast` (the last character speaker excluded), `mention-then-trigger` (a character named in the last line wins, else `trigger-banlast`). |

The reference is Claude Sonnet 5 on OpenRouter (Anthropic pinned, temperature 0) with the cast's personas,
asked for its best pick and every plausible pick as JSON. It is not the shipped prompt.

## Running it

```sh
# reranker: weights from the dev model cache, read with remote loads off
mkdir -p .cache/speaker-pick/transformers
cp -r data/cache/models/transformers/Xenova .cache/speaker-pick/transformers/
taskset -c 0-3 node scripts/probes/speaker-pick/run.ts rerank --label=rerank-4c
taskset -c 0 node scripts/probes/speaker-pick/run.ts rerank --label=rerank-1c

# paid: OPENROUTER_API_KEY from the environment or the repo .env (about $0.06 and $0.03)
node scripts/probes/speaker-pick/run.ts reference
node scripts/probes/speaker-pick/run.ts arbiter-openrouter            # --model= defaults to anthropic/claude-sonnet-5

# small local models: one CPU-capped llama.cpp container on 127.0.0.1:28121 (4 CPUs, 4 GB by default)
scripts/probes/speaker-pick/rig.sh models
scripts/probes/speaker-pick/rig.sh up qwen2.5-0.5b
node scripts/probes/speaker-pick/run.ts arbiter-local --label=qwen2.5-0.5b
scripts/probes/speaker-pick/rig.sh mem
scripts/probes/speaker-pick/rig.sh down

node scripts/probes/speaker-pick/run.ts report                        # the tables in RESULTS.md
```

Each arm overwrites `results/<arm>.jsonl`, one row per cut with the pick, the raw reply, tokens, latency, cost
and the OpenRouter generation id. The rows are synthetic and committed, so `report` re-runs without spend.
The rig refuses a port that is already bound and never touches another server on the box.
