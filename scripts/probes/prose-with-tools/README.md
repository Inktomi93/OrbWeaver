# Prose with tool calls, per local model and server

Does a local model write the reply's prose and the RPG state tool calls in the same completion when the folded
turn mounts the tools? The capability floor (`packages/inference/src/capability/floor.ts`) closes
`tools.silencesProse` on every `auth: endpoint` connection that no tier measured. A measured row with
`silencesProse: false` would let folded RPG run on that model. The bar for writing such a row waits on an owner
ruling; `results/2026-10-03/INVESTIGATION.md` gives the evidence and a recommendation.

## Method

Measure the request the app actually sends, on a fixed transcript, many times per beat.

1. `capture-app-requests.ts` boots a private single-user stack and plays the scene (`scene.ts`) against a
   loopback recorder. The recorder answers each turn with the scene's scripted game master reply and one
   `update_scene` call, so the history and the tracked state are the same on every replay. It writes each folded
   turn's request body as the app sent it, for a `vllm` or a `llama-cpp` connection.
2. `replay.ts` sends those bodies to a live server N times per beat in streaming and non-streaming, optionally
   merged with an override (`chat_template_kwargs`, `temperature`, `seed`). It writes one JSON line per reply.
3. `replay-summary.ts` prints the per-beat table with a 95% Wilson interval per cell and mode.

Shapes per reply:

- `both`: at least 40 characters of prose outside any `<think>` block, and at least one parsed tool call.
- `prose-only`, `tools-only`, `empty`: the other three shapes.
- `leak`: tool-call markup in `content`, meaning the server did not parse a call the model wrote.

A miss loses no output: a tools-only turn takes the engine's narrative recovery pass, and a prose-only turn takes
the post-commit round.

`probe.ts` and `summarize.ts` are the first, hand-built method. They are kept so their results stay
reproducible, but they do not describe the app: the request is hand-built, and the state drifts per run.

## Run

```sh
node scripts/probes/prose-with-tools/capture-app-requests.ts --provider=vllm --out=<results>/app-requests
node scripts/probes/prose-with-tools/replay.ts --cell=vllm-app --base=http://127.0.0.1:<port>/v1 --model=<id> \
  --bodies=<results>/app-requests/vllm --out=<results>/replay --reps=10 --parallel=8
node scripts/probes/prose-with-tools/replay-summary.ts <results>/replay
```

The capture uses loopback ports 28140–28142 and refuses one that is taken. On llama.cpp, give the server a
context of at least the parallel request count times prompt plus `max_tokens`, because its slots share one window.
