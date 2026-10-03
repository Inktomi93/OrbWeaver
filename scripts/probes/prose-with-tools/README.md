# Prose with tool calls, per local model and server

Does a local model write the reply's prose and the RPG state tool calls in the same completion when the folded
turn mounts the tools? The capability floor (`packages/inference/src/capability/floor.ts`) closes
`tools.silencesProse` on every `auth: endpoint` connection that no tier measured. A cell that clears the bar
below earns a dated measured row with `silencesProse: false` in
`packages/inference/src/capability/sources/measured/local-servers.ts`, which lets folded RPG run on it. An
unmeasured model stays closed.

## What one turn sends

The shape production sends on a local wire for a folded turn:

- the game master persona as the system row, the scene so far as user and assistant rows;
- the player's beat with the state reminder in the same user row. A local row carries
  `midConversationSystem: false`, so the depth-0 system note folds into bare user text after the beat;
- the seven terminal tools (`update_party`, `update_inventory`, `update_scene`, `set_tracker`, `upsert_quest`,
  `add_journal_entry`, `no_changes`) built by the production builders against the game's refs;
- `tool_choice: "auto"`, `max_tokens: 1200`, and `strict: true` on every tool for vLLM only (its provider row
  is `strictJson: "default-on"`).

The history's assistant rows are a scripted game master, the same in every cell, so each turn compares across
cells. The tracked state moves with whatever the model's tool calls wrote, so the reminder reads like the
app's would.

## Verdict per turn

- `both`: at least 40 characters of prose outside any `<think>` block, and at least one parsed tool call.
- `prose-only`, `tools-only`, `empty`: the other three shapes.
- `leak`: tool-call markup in `content`, meaning the server did not parse a call the model wrote.

A cell states `silencesProse: false` only when, in streaming AND non-streaming, it co-emits on at least 20% of
turns and has no empty reply, error or leak. A miss costs one extra call and no output: a tools-only turn takes
the engine's narrative recovery pass and a prose-only turn the post-commit round. `summarize.ts` holds the bar
and prints the verdict. Anything less stays closed.

A row cannot see how a server was launched. Where the launch mode decides the outcome (KoboldCpp's default
tool mode forces tool-only output), the server gets no row.

## Run

```sh
node scripts/probes/prose-with-tools/probe.ts --cell=<name> --server=vllm --base=http://127.0.0.1:<port>/v1 \
  --model=<id> --template=<label> [--body='{"chat_template_kwargs":{"enable_thinking":false}}']
node scripts/probes/prose-with-tools/summarize.ts scripts/probes/prose-with-tools/results/<date>
```

Each run writes `results/<date>/<cell>.<mode>.json` (every turn's content, reasoning, raw calls, prompt and
completion tokens, timings) and appends one summary line per mode to `results/<date>/cells.jsonl`. The dated
`RESULTS.md` in the same directory records the launch argv, device and verdict for every cell.
