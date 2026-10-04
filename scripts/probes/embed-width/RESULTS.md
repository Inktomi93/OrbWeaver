# Embedding-width results (work item 0507)

**Run:** 2026-10-04, local-auth isolated stage at `a02aaa6a76` (server port 8898), owner principal
`01m42bxawafq9869sy9hwxvvvr`. Raw records:
`~/homelab/development/probe-archive/embed-width-2026-10-04/raw/` (outside the repo).

**Status: stopped at the first failing cell.** The matrix stops on a failure by rule. Two findings stopped it
(below); the cells after them have not run.

## Cells

| # | cell | embedder | stored width (cards / document / memory) | search: cards / document / memory | role row | verdict |
| - | - | - | - | - | - | - |
| 0 | seed, memory on, no Utility model | built-in `jinaai/jina-clip-v2@q8` | 1024 / 1024 / 1024 | hit / hit / hit | none | the memory sweep **failed** (finding 1); search still answered, because memory was complete vacuously from before it was switched on |
| 1 | width change, memory on, no Utility model | built-in, declared 512 | 512 / 512 / 512 | refused `search_space_reindexing` / refused / refused | running, then failed | **FAIL** (finding 1); re-run pending 0521 |
| 2 | re-point back, memory off | built-in, 1024 | 1024 / 1024 / none (memory off) | hit / hit / none (memory off) | running, then **failed** | widths and search pass; role row **FAIL** (finding 2) |
| 3 to 9 | local server (Ollama, nomic-embed-text 768 and 256, all-minilm 384), OpenAI text-embedding-3-small 1536 and 512, OpenRouter, race, bad key, member | | | | | not run |

OpenRouter offers embedding models (33 listed on 2026-10-04, including `baai/bge-base-en-v1.5`; raw list in
`openrouter-embedding-models.json`). Gemini is pending on item 0527 (quota).

Ollama 0.35.1 on GPU 1 answered `/v1/embeddings` at 256 for nomic-embed-text with `dimensions: 256` and at
384 for all-minilm. GPU 0 stayed at 4,853 MiB throughout. The container was removed after the stop; its model
volume `orb-probe-embed-width-ollama` was kept for the resumed run.

## Finding 1: with memory on and no Utility model, every move leaves search refusing

Records: `2026-10-04T02-35-03.450Z-seed-state.json` and `2026-10-04T02-36-52.860Z-bind-local-light-512.json`.

- The move's three rebuilds ran. `index` and `databank-reindex` succeeded at 512, and the stored widths moved to
  512. `memory-backfill {embedderChanged: true}` failed with `no summarize connection is bound for this user —
  bind one in Connections`.
- The memory scope never completes, so the `embed` space never promotes. Card, document and memory search all
  refuse with `search_space_reindexing`. Nothing short of binding a Utility model brings search back.
- The plain whole-corpus memory sweep fails the same way: the seed's sweep is the same failure.
- The cause is outside 0507. It is the same defect as the 2 reds in
  `tests/server/domain/chat/substrate/backfill.int.test.ts` ("Memory on with no summarize connection"), which are red on
  main too: the digest batch asks the unbound summarizer for its context size and throws, instead of skipping digests.
  The orchestrator reports that item 0521 fixes it on another branch.

## Finding 2: the role row shows a failed rebuild after a later rebuild succeeded

Records: `2026-10-04T02-37-memory-off-setting-response.json` (memory switched off before the move),
`2026-10-04T02-37-24.717Z-bind-local-light-1024.json`, and `2026-10-04T02-39-37.492Z-state-after-stop.json` (still
"failed" two minutes later).

- The move in cell 2 rebuilt cards and the document at 1024 and completed. Search answers, and every scope is
  active on the new generation. Memory was off, so the move queued no memory row: the memory scope is recorded
  complete directly.
- The role row still says "Rebuild failed — see Jobs". `embedderRebuildState` (commit `a02aaa6a76`) takes the
  newest rebuild of each kind. The newest memory rebuild is cell 1's failed row, and no newer memory row
  replaces it.
- This was a defect in this lane's own client change. Fixed after the stop: the row now asks search first, through
  `search.spaceStatus`, which reads the same generation state search refuses on. Once search answers it shows nothing;
  while search is paused it shows running or failed from the rebuild rows. The unit and connections-roles CT
  regressions replay this cell's rows. The fixed rule still has to be confirmed live in the resumed matrix.
