# Local server probes

What Ollama, llama.cpp server and KoboldCpp advertise about a model, and whether the advertised capability
holds end to end. The readers under test are `packages/inference/src/catalog/endpoint.ts`; the verdicts and
the rows they rest on are in [`RESULTS.md`](RESULTS.md).

## The rig

`rig.sh` runs each server as a CPU-only container, capped (`--cpus 4 --memory 6g` by default), bound to a
loopback port of its own, with the models in a scratch directory (`.cache/local-rig`, gitignored). Nothing
touches a user's model directory, and `down` removes every container and volume.

```sh
scripts/probes/local-servers/rig.sh models          # download the GGUFs once (about 1 GB)
scripts/probes/local-servers/rig.sh up ollama       # one arm; see the header of rig.sh for the list and ports
scripts/probes/local-servers/rig.sh up llamacpp-chat
scripts/probes/local-servers/rig.sh ps
scripts/probes/local-servers/rig.sh down            # everything, volumes included
```

Models: Qwen2.5-0.5B-Instruct Q4_K_M (a tool-capable template), SmolVLM-256M-Instruct Q8_0 with its
projector (vision), nomic-embed-text-v1.5 Q8_0 (an embedder). The Ollama arm pulls `qwen2.5:0.5b`,
`moondream` and `nomic-embed-text` from the Ollama library into its own volume.

Before `up`, check `docker ps` and `ss -ltnp`: the script refuses a port that is already bound, so a
collision with another server on the box is a refusal, never a takeover.

## The probes

```sh
node scripts/probes/local-servers/run.ts                  # every arm
node scripts/probes/local-servers/run.ts ollama kobold-chat   # a subset
```

Per arm, in order:

1. Record what the server advertises (`/api/show`, `/props`, `/api/extra/version`, `/v1/models`, …) as raw
   JSON under `results/raw/<arm>/`, and, when every arm ran, into
   `tests/inference/catalog/_local-servers-fixtures.ts` (then run
   `pnpm exec biome check --write tests/inference/catalog/_local-servers-fixtures.ts` for the house
   formatting and numeric separators). The unit tests parse exactly what the servers said.
2. Run the real reader (`fetchEndpointModels`) over the live server and log the rows it detected.
3. Prove each capability against the same server: a tool call comes back as `tool_calls`; an image part is
   described (a solid red square reads "red"); an embedding has the advertised width; a JSON-schema
   `response_format` parses. Where the server states nothing (KoboldCpp and tools) the probe records what
   happened without a verdict. Negative controls: a model the server lists without tools or vision is
   refused.
4. On the Ollama arm, `ollama-ctx`: a fact at the start of a prompt longer than the server's default window,
   through `/v1/chat/completions` and through `/api/chat` with `options.num_ctx`, reading the prompt token
   counts each returns.

Evidence: `results/<arm>.jsonl`, one row per step, append-only.

## Limits the reader cannot see

- llama.cpp server reports `chat_template_caps` even when started with `--no-jinja`, and then refuses
  `tools[]` with "tools param requires --jinja flag". The reader states tools; the chat backend maps that
  refusal to a readable error, and the user sets tool calls to no under Advanced or restarts with `--jinja`.
- The app keeps one mirror per server URL and reader (`catalog:endpoint:<reader>:<url>`), persisted for a
  week. A server restarted without its projector, or without `--jinja`, keeps its earlier facts until the
  mirror refreshes: an admin's catalog refresh (Admin → operations → refresh catalog) invalidates every mirror
  on that provider, the daily refresh job re-reads on its cadence, and the week-old ceiling re-reads on its
  own.
