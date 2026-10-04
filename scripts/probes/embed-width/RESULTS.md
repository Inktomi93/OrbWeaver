# Embedding-width results (work item 0507)

**Run 2:** 2026-10-04, local-auth isolated stage at `1e22e132c3` (server port 8888), owner principal
`01m42sj1p2fzy98wa1cxak4e6v`, member principal `01m42sj3xhfzy98ya1a22h9d57`. Raw records and the stage server log:
`~/homelab/development/probe-archive/embed-width-2026-10-04/raw-1e22e132c3/` (outside the repo). Run 1 (stage
`a02aaa6a76`, `raw/`) stopped on two findings, both fixed and confirmed below. Cells 3a and 8 were re-run on a fresh
stage at `9eccc1bef3` (`raw-9eccc1bef3/`), after the fix for finding 1 and observation 3.

**Status: every cell passes through the product path.** Gemini is pending on item 0527 (quota).

Every accepted move ended with the stored width equal to the target in all four vector tables (`dim` column and
blob length agree), one generation per owner, every scope active on it, `search.spaceStatus` not paused, the role
row clear, and two `corpusRecomputed` events on the owner's user bus (read over `stream.connect`). Every refused
move left the embed binding, the stored targets and every vector row as they were, queued no workload, and all
four searches still answered.

Searches: cards ("keeper of a lighthouse", expects Maren Vos in the top 3), the databank document ("salt glass",
expects "Ostrel harbour tides"), verbatim memory segments in Maren's chat ("brass key"), and memory digests in the
same chat (judged by the chat id; digests exist once Utility is bound).

## Cells

| # | cell | embedder | stored width (cards / document / segments / digests) | search: cards / document / segments / digests | role row, workloads | verdict |
| - | - | - | - | - | - | - |
| 0 | seed, memory on, no Utility model | built-in `jinaai/jina-clip-v2@q8` | 1024 / 1024 / 1024 / none | hit / hit / hit / none | clear; `memory-backfill` succeeded | **pass** (run 1 failed here) |
| 1 | narrow to a declared width, memory on, no Utility model | built-in, declared 512 | 512 / 512 / 512 / none | hit / hit / hit / none | running → clear in 47 s; `index`, `databank-reindex`, `memory-backfill {embedderChanged}` succeeded | **pass** (run 1 finding 1 fixed by 0521) |
| 2 | back to the default width, memory on | built-in, 1024 | 1024 / 1024 / 1024 / none | hit / hit / hit / none | running → clear in 3 s; all three succeeded | **pass** (run 1 finding 2 fixed: the row clears) |
| - | Utility bound (`openai/gpt-4o-mini` on OpenRouter), memory swept | built-in, 1024 | 1024 / 1024 / 1024 / 1024 | hit / hit / hit / hit | `memory-backfill` succeeded | setup |
| 3a | local server, first bind of a cold model | Ollama `nomic-embed-text` | 768 / 768 / 768 / none | hit / hit / hit / none | write accepted in 14,982 ms (the cold probe embed took 14.95 s); clear in 11 s; all three succeeded | **pass** at `9eccc1bef3` (run 2 failed: finding 1) |
| 3a' | same bind, model warm | Ollama `nomic-embed-text` | 768 / 768 / 768 / 768 | hit / hit / hit / hit | clear in 50 s; all three succeeded | pass |
| 3b | local server, `dimensions` 256 | Ollama `nomic-embed-text`, declared 256 | 256 / 256 / 256 / 256 | hit / hit / hit / hit | clear in 33 s | **pass** |
| 3c | local server, native width | Ollama `all-minilm` | 384 / 384 / 384 / 384 | hit / hit / hit / hit | clear in 37 s | **pass** |
| 4a | hosted, native width | OpenAI `text-embedding-3-small` | 1536 / 1536 / 1536 / 1536 | hit / hit / hit / hit | clear in 43 s | **pass** |
| 4b | hosted, `dimensions` 512 | OpenAI `text-embedding-3-small`, declared 512 | 512 / 512 / 512 / 512 | hit / hit / hit / hit | clear in 43 s | **pass** |
| 5 | OpenRouter embedder | `baai/bge-base-en-v1.5`, Purpose embeddings, declared 768 | 768 / 768 / 768 / 768 | hit / hit / hit / hit | clear in 38 s | **pass** after two user steps (observation 2) |
| 6a | a width the model cannot make | Ollama `all-minilm`, declared 1024 | unchanged (768) | hit / hit / hit / hit | refused `connection_embed_width_unmakeable`, detail `{stated: 1024, measured: 384, truncatable: false}`; no workload | **pass** |
| 6b | local server stopped | Ollama `nomic-embed-text` | unchanged (768) | hit / hit / hit / hit | refused `connection_embed_unreachable`; no workload | **pass** |
| 6c | server restarted, same row re-bound | Ollama `nomic-embed-text` | 768 / 768 / 768 / 768 | hit / hit / hit / hit | clear in 36 s | **pass** (the refused row is asked again) |
| 7 | race: local, then hosted while the first rebuild runs | Ollama `all-minilm` → OpenAI `text-embedding-3-small` | 1536 / 1536 / 1536 / 1536 | hit / hit / hit / hit | second move landed while `index` was running; target epoch 12 → 14; clear in 8 s; no restart | **pass** |
| 8 | bad key on the hosted embedder | OpenRouter `baai/bge-base-en-v1.5` (768) under a bad key | unchanged while bad | hit / hit / hit while bad | refused `connection_embed_auth` at `9eccc1bef3` (run 2: `connection_embed_unreachable`), no workload, bindings unchanged; after `credentials.replace`, the same row binds and rebuilds to 768 | **pass** (observation 3 fixed) |
| 9 | member re-points their own embedder | Ollama `all-minilm` as `member` | member: 384 (10 cards); owner: 768, untouched | member sees only their own rows | member's `index` and `databank-reindex` (ownerId member) succeeded; owner's targets unchanged (epoch 15) | **pass** |

Ollama ran on GPU 1 only (`--gpus device=1`, loopback port 18434); GPU 0 stayed at 4,853 MiB throughout, in both
runs. The container was removed after each run; its model volume `orb-probe-embed-width-ollama` was kept.

## Finding 1 (fixed): a cold local embedder's first bind was refused as unreachable

Records: `2026-10-04T06-34-48.994Z-bind-ollama-nomic-768-refused.json`, `stage-server.log` (06:34:46 WARN "a
re-point's width probe got no answer").

- The first bind of `nomic-embed-text` in a fresh Ollama container took 10,011 ms and was refused with
  `connection_embed_unreachable`. The server log shows the width probe aborted (`ProviderError kind: aborted`) at
  `WIDTH_PROBE_TIMEOUT_MS = 10_000` (`packages/server/src/domain/embeddings/substrate/generation.ts`).
- Ollama was running and loading the model: its log reads "client connection closed before llama-server finished
  loading, aborting load" at 06:34:46, and the next load took 7.02 s. A warm reload took 1.05 s.
- The user is told "Couldn't reach this embedder ... Check that its server is running", and the server is running.
  The same bound hits any endpoint whose first answer is slow: a first model load, or a sleeping server waking.
- The refusal itself was safe: binding, targets, widths and all four searches were identical before and after.
- The fix (`9eccc1bef3`): detection already proves reachability, since a dead host fails there, so the width probe
  on a remote embedder gets the row's embed request deadline (`embedRequestTimeoutMs`: `requestTimeoutMs`, else
  120 s) instead of 10 s. The built-in encoder keeps its own bound.
- Re-run on a fresh stage with a fresh Ollama container (nothing loaded): Ollama answered detect at 07:14:42,
  started loading the model at 07:14:43 and finished at 07:14:56, and the width probe's `/v1/embeddings` returned
  200 after 14.95 s. The write returned 200 in 14,982 ms, and the rebuild moved cards, the document and the
  segments to 768. Records: `raw-9eccc1bef3/2026-10-04T07-15-15.858Z-bind-ollama-nomic-768.json`, `stage-server.log`.
  Utility was not bound on this stage, so there are no digests.

## Observations (not failures)

1. **Private endpoints need admission first.** A multi-user stage admits no private address, so creating the Ollama
   row was refused with `connection_base_url_refused` until the owner admitted `127.0.0.1:18434`
   (`settings.updateAppSettings`, the editor's Admit button). This is the intended F12 rule; the probe now admits
   the authority as the owner.
2. **An uncurated OpenRouter embedder takes two manual steps.** The OpenRouter catalog lists `baai/bge-base-en-v1.5`
   as `kind: embedding`, but the row's kind comes from `declared.kind` or the curated rows only
   (`packages/server/src/domain/connection/substrate/kind.ts`), so the new row offered chat tasks and the bind was
   refused `connection_task_unservable`. With Purpose set to embeddings, the bind was refused
   `connection_embed_width_unmakeable` `{stated: 1024, measured: 768}`: with no width declared, the row is assumed
   1024. The server message says "not the 1024 its connection states", though the user stated nothing; the
   client's text names the fix ("Set its vector width under Advanced to 768"). After setting width 768 the bind
   passed. Records: `06-39-49.581Z` and `06-41-13.036Z` `bind-openrouter-bge-768-refused.json`. The probe's arm
   now declares both. At `9eccc1bef3` the refusal's detail carries `assumed`, and with no width stated both the
   server and the client name the width assumed for the model instead. How a row's kind is derived is unchanged.
3. **A bad key reads as unreachable (fixed).** The hosted embedder under a bad key was refused
   `connection_embed_unreachable`, whose client text says to check that the server is running. A 401 is a key
   problem, not a reachability one. At `9eccc1bef3` a probe refused with `auth_failed` is refused
   `connection_embed_auth`, and the client says the embedder refused its key and to check it under Credentials.
   Record: `raw-9eccc1bef3/2026-10-04T07-15-47.804Z-badkey-openrouter-bge-768.json`.
4. **Ollama rows offer `imageEmbed`.** `connection.list` gives every Ollama row the tasks `embed` and `imageEmbed`,
   including `all-minilm`, which embeds text only. Not exercised here.

## Run 1 findings, now confirmed fixed

- **Run 1 finding 1** (memory on, no Utility model: every move left search refusing): cells 0 and 1 now complete,
  and `memory-backfill {embedderChanged: true}` succeeds with segments only (fixed by item 0521).
- **Run 1 finding 2** (the role row showed a failed rebuild after a later one succeeded): the row now reads
  `search.spaceStatus` first. In every accepted cell it went from running to clear, and it never showed failed.
