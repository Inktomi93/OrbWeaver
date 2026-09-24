# OpenRouter provider probes

Eight standing wire probes against the OpenRouter chat-completions surface (`anthropic/claude-sonnet-5`,
Anthropic pinned with `allow_fallbacks:false`). Verdicts + recommendations: [`RESULTS.md`](RESULTS.md).
Raw evidence: `results/<probe>.jsonl` — one row per arm, append-only, JSONL so a partial run is still
readable. Subject docs: D174.

| probe | question | ~cost |
|---|---|---|
| `f4` | do enriched tool descriptions break the prompt-cache PREFIX? | $0.02 |
| `f4a` | does changing `reasoning:{effort}` bust the OR cache? | $0.07 |
| `f5` | is native thinking depth reachable through OR's `effort`? (needs `ANTHROPIC_API_KEY`) | $0.05 OR + $0.12 native |
| `or5` | do array-offset cache breakpoints under-cache tool-heavy turns? | $0.01 |
| `or5b` | is the cache breakpoint invariant across a within-turn tool exchange (the §5 fix)? | $0.09 |
| `or7` | is replaying a reasoning block a hard 400? | $0.02 |
| `or7b` | is dropping reasoning still safe on a multi-hop tool chain? | $0.06 |
| `or8` | which layout of adjacent same-role rows keeps the prior call's cache entry readable? (both wires; needs `ANTHROPIC_PROBE_KEY` or `ANTHROPIC_API_KEY`) | $0.04 OR + ~$0.04 native |
| `or9` | with signed thinking carried on each reply, which same-role-run layout is accepted and keeps the cache? (three wires, sonnet-5 and opus-5-5; `OR9_WIRES`/`OR9_MODELS`/`OR9_VARIANTS` narrow a re-run) | ~$0.8 OR + ~$0.7 native |
| `or10` | with the carry on, which placement of cues, depth notes and system content keeps signed thinking valid under prefix binding? (opus-5-5 and fable-5-1 direct, plus OpenRouter Messages; `OR10_WIRES`/`OR10_MODELS`/`OR10_SCENARIOS`/`OR10_MODES` narrow a re-run) | ~$0.1 OR + ~$0.6 native |
| `or11` | does a model obey an override in a depth-2 system row in its legal slot, or only accept it? And does the fold to user text carry it? (direct; sonnet-5, opus-4-8, opus-5-5; `OR11_WIRES`/`OR11_MODELS`/`OR11_ARMS`/`OR11_TRIALS` narrow or size a run) | ~$0.08 native |

```sh
node scripts/probes/openrouter/run.ts                 # the batch (skips probes with a completed run)
PROBES=f4,or5 node scripts/probes/openrouter/run.ts   # a subset
FORCE=1 PROBES=f4 node scripts/probes/openrouter/run.ts   # re-measure
```

**⚠️ Live spend** (~$0.32 for the full batch). Keys are read from `process.env` first, then the repo
`.env` found by walking up from this directory (this harness runs from git worktrees, which carry no
`.env`); they are never printed. `OR_MODEL` / `NATIVE_MODEL` override the model.

## House rules for anything added here

- **One variable moves per arm.** Every probe states its constant and its mover in its file header; a row
  that changes two things measures nothing.
- **Each probe carries its own controls.** A "prime" arm and a byte-identical "replay" arm bracket the
  measurement, so a miss can be told apart from a cold cache.
- **Resume unit is the PROBE, not the arm.** The cache arms are only meaningful fired back-to-back inside
  one Anthropic cache TTL window, so a half-finished cache probe must re-run whole. `run.ts` skips a
  probe that already has a non-`blocked` `kind:"verdict"` row.
- **Every arm's raw wire evidence is written**: HTTP status, `prompt_tokens_details.cached_tokens`,
  `cache_write_tokens`, `completion_tokens_details.reasoning_tokens`, `usage.cost`, and on a non-200 the
  verbatim upstream error body. A 400 is a verdict, not a failure.
- **Prefixes are nonce-stamped per run** so a previous run's live cache entry can never make a "prime"
  arm read as a hit.
