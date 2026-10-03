# RPG structured state round: live matrix (work item 0511)

Does the post-commit RPG state round take the structured vehicle where a row cannot force a tool call, and stay on
tools where it can, on real models through the app's own path? The findings are in [`RESULTS.md`](RESULTS.md).

## What runs

`run.ts` boots the real composition root (`createServices`) over a fresh in-memory libSQL db (`tests/support/db.ts`
`freshDb`), never the dev database. It stores the cell's key through `credentials.add`, creates the connection
through `connection.create` and binds it as the host's chat row. Each consumer then plays through production code:

- **folded** and **cheap**: a narrator character, `chat.startChat`, `rpg.createGame`, `rpg.updateConfig` (mode,
  three trackers, `stateCaptureVehicle`), then eight `chat.send` turns. The gather, the character turn, the
  post-commit flush and the state round are the shipped ones.
- **resync**: `rpg.resyncFromStory` on the cheap game after its eight turns.
- **swipes**: a `cheap` game where `chat.send`, `chat.swipe` and `chat.selectVariant`, with guided steers, give one
  slot two variants that write different state, then build and regenerate the next turn on the selected one. The
  checks ask whether each variant's panel is the state it built on plus its own writes (`SWIPE_CHECKS` in
  `scenario.ts`).

Nothing builds a request. The provider transport (`providerSeams.sdkFetch`) is tapped to record every body, its
latency and its reply; the RPG trace ring (`rpgTrace: true`) gives the flush path, the vehicle and each call's
verdict; the `rpg.*` log lines on stdout give drops, retries and failures; `rpg.getGame` gives the panel's
`effectiveDelivery`. After each flush the probe reads `rpg.getTrackerView`, the panel, and checks it against what the
turn implied (`scenario.ts`).

`scenario.ts` holds the eight turns: arrival (location, time), two named NPCs (`presentUpsert`), a purchase
(inventory add), labour (an actor tracker delta), a letter (an actor tracker set, a game tracker set, a quest), a
move at midnight (location, time, cast leaves), a used-up rope (inventory remove) and a quiet beat (no change).

## Running

```sh
PRIVATE_ENDPOINT_ALLOWLIST=127.0.0.1:28941,127.0.0.1:28942,127.0.0.1:28943,127.0.0.1:28944 \
  LOG_LEVEL=info node scripts/probes/rpg-structured-live/run.ts <cell>...
node scripts/probes/rpg-structured-live/run.ts report
```

Cells are listed in `CELLS` in `run.ts`. `<cell>@<consumer>,<consumer>` runs only those consumers, and the report
reads the latest run per cell and consumer, so a partial rerun never hides the rest. The allowlist admits the four loopback engine ports, which a deployment
does not admit by default. Keys come from the environment or the repo `.env` (`ANTHROPIC_PROBE_KEY`,
`OPENROUTER_PROBE_KEY`, `OPENAI_PROBE_KEY`, `GEMINI_PROBE_KEY`). `RPG_LIVE_RESULTS=<path>` sends a parallel batch's
rows to its own file, so two writers never interleave a line. The report scores every stored row with the current
checks, so runs taken before a check changed still read by one rule.

The OpenRouter cells also re-send the first state-round body as a streaming call with `debug.echo_upstream_body`;
the `upstream` field of that turn's row is what OpenRouter forwarded.
