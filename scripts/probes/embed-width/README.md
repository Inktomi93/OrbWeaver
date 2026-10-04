# Embedding-width probe

The live acceptance matrix for work item 0507: an embedder of any width indexes cards, a databank document
and chat memory, and a re-point or width change rebuilds them with no restart. The verdicts are in
[`RESULTS.md`](RESULTS.md).

## The rig

- A local-auth isolated stage, never the dev stack:
  `pnpm snap / --stage-auth local --ref <sha> --no-shot --text`. `pnpm snap --stage-status` names its server
  port; the stage db is `.cache/snap-stage/<sha>-local/data/db/orbweaver.db`. The stage reads no `.env`, so
  hosted keys reach it only as credentials the probe stores through `credentials.add`.
- A local OpenAI-compatible embed server on GPU 1 only, bound to loopback:

  ```sh
  docker run -d --name orb-probe-embed-width-ollama --gpus '"device=1"' \
    -p 127.0.0.1:18434:11434 -v orb-probe-embed-width-ollama:/root/.ollama ollama/ollama:latest
  docker exec orb-probe-embed-width-ollama ollama pull nomic-embed-text   # 768, honours `dimensions`
  docker exec orb-probe-embed-width-ollama ollama pull all-minilm         # 384
  docker rm -f orb-probe-embed-width-ollama                               # after the run
  ```

- Hosted keys come from the environment (`OPENAI_PROBE_KEY`, `OPENROUTER_PROBE_KEY`); never print them.

## The probe

```sh
node scripts/probes/embed-width/run.ts <verb> [args] --base http://127.0.0.1:<port> --db <stage db> --archive <dir>
```

| verb | what it does |
| - | - |
| `seed` | three cards, one databank document and a 24-message chat (imported through `/api/import/chat`), then `memory-on` |
| `memory-on` | switches the owner's memory on and runs the whole-corpus memory sweep |
| `bind <embedder>` | the confirm's preview (`connection.embedSpaceChangePreview`), the re-point (`connection.setBinding`), then waits for every workload |
| `race <a> <b>` | re-points to `a`, waits until its rebuild runs, re-points to `b` |
| `badkey <embedder>` | re-points under a bad key, then replaces the key and edits one card |
| `member <embedder>` | the second human re-points their own embedder; the owner's targets must not move |
| `state <label>` | the evidence record alone |

Every verb archives one JSON record: the bindings, the stored width per vector table and generation (read
from the stage db, `dim` and the blob length), the generation targets and scope ledger, the three searches
(cards, the document, the chat's verbatim memory through `search.search`), the workload rows, and what the
vector role row says at each change (`embedderRebuildState` over the rows the row reads).

The embedder arms are the `EMBEDDERS` table in `run.ts`.
