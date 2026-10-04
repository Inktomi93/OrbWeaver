# Smart-picker live matrix (work item 0492)

Do Smart's two speaker pickers work on real models through the app's own path? Read the findings in
[`RESULTS.md`](RESULTS.md).

## What runs

`run.ts` builds the real `@orb/inference` runtime over in-memory stores (the `tests/inference/_support.ts`
ports), adds a user connection for the cell, and binds it as the user's Utility row (`summarize`, which
`structured` rides) or rerank row. Each scene then goes through the production code:

- Utility arbiter: `runtime.roleClientsFor` → `speakerArbiterFor` (`entry/compose/chat.ts`) → `smartArbitrate`,
  with the shipped `chat.arbiter.system` prose and `resolveSideGenSampling(SIDE_GEN_POSTURES.arbiter)`.
- Reranker: `runtime.roleClientsFor` → the compose root's `resolveSpeakerReranker` shape → `rerankPick`.

Candidate lines come from `characterLine`, the human names from `humanPlayerNames`. The probe never builds a
request: the runtime's wire tap (`captureWire`) records the body each call sent, so the vehicle and the label
enum in `results.jsonl` are what went over the wire.

`scenes.ts` holds nine scenes: an open floor, a role-addressed question, one and two clear names (both resolve
without a model call), a player sharing a character's name, two characters sharing a name, a narrator seat, an
off-roster mention and a self-response ban. Each cell then runs two degrade controls on the open floor: the same
provider naming a model it does not serve, then nothing bound. Both must degrade, and no model scene may.

## Running

```sh
node scripts/probes/smart-picker-live/run.ts <cell>...   # cells: see CELLS in run.ts
node scripts/probes/smart-picker-live/run.ts report      # per-cell table from the latest run of each cell
```

Keys come from the environment (`OPENAI_PROBE_KEY`, `GEMINI_PROBE_KEY`, `OPENROUTER_PROBE_KEY`,
`DEEPSEEK_PROBE_KEY`), else the repo `.env`. `SMART_PICKER_MODEL_CACHE` names a transformers cache holding
`Xenova/ms-marco-MiniLM-L-6-v2`; remote downloads are off. The local cells expect vLLM on `127.0.0.1:28941` and
llama.cpp on `127.0.0.1:28942`; `RESULTS.md` has the exact launch commands. The OpenRouter cell also re-sends
each structured body as a streaming call with `debug.echo_upstream_body`, so `or-echo` rows show what OpenRouter
forwarded upstream.
