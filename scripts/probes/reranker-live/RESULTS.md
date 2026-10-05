# Reranker live acceptance results (work item 0514)

**Run:** 2026-10-03 on branch head `5bcd1c8d54`. Evidence: `results.jsonl` (one row per cell, run, seed check, cold
start, token count and reference score) and `speaker-pick/`. Method: the header of `run.ts`, and "Method" below.

**Device:** 13th Gen Intel Core i7-13700K, x64, Node v26.5.0, CPU only (`device: "cpu"`, `CUDA_VISIBLE_DEVICES=`
empty). Every run was pinned to 4 cores (`taskset -c 0-3`, so `localLightCpuThreads()` = 4). The host load average
was 3.4 to 7.5 throughout (1-minute average 4.2 to 5.2 during the measured runs), so timings are upper bounds.

**Models, as served by the curated rows:**

| model | revision | file | window |
| - | - | - | - |
| `cross-encoder/ettin-reranker-32m-v1` (default) | `b33e5ceb5110773ea9cf5e00c9bedc83a8c2afdd` | `model_quint8_avx2.onnx` | 2,048 |
| `cross-encoder/ettin-reranker-17m-v1` (light) | `9e4aa35321a6dd1a43ca313f500c4b4f7cfb5cc6` | `model.onnx` (fp32) | 2,048 |
| `Xenova/ms-marco-MiniLM-L-6-v2` (selectable) | none pinned | `model.onnx` (fp32) | 512 |

## Verdict

The shipped reranker works end to end in every consumer that reranks. The boot seed binds it, the role resolves it at
its 2,048-token window, and each consumer's own call is served by `ettin-reranker-32m-v1` with no degrade. Every
document over 2,000 characters reached the reranker whole, late closing included. No consumer cell failed because of
product code.

There are two findings, and neither is a code defect:

1. **The ettin models do not use text past about 250 pair tokens.** The 2,048 window feeds the model the whole
   document, and late text still shifts the score slightly, so the clamp works. But a deciding fact that starts past
   about 250 tokens of the pair no longer moves the score: the same fact placed first scores 9 to 10, and placed after
   250 tokens it scores the same as no fact at all. Upstream PyTorch `CrossEncoder` at the same revisions gives the
   same numbers (17m fp32 to two decimals), so the local-light serving is correct and this is the models' own limit.
   Their training data has a mean document length of 660 characters (model card). MiniLM still used a fact starting at
   478 tokens. The premise of the swap, that long items get read past 512 tokens, does not hold for ranking quality.
   The default reads less of a document than MiniLM did.
2. **Smart picks the wrong speaker on the long-persona case with every model**, MiniLM included (Maelis, "reads maps",
   over Brannoc, "reader of old scripts, ciphers and inscriptions"). It is one case and every model fails it the same
   way, so it is a corpus case the cross-encoder family cannot answer, not a regression.

On short inputs, ettin wins. On the speaker-pick fixtures the shipped `rerankPick` scores 81% hand-judged on the 32m,
92% on the 17m and 73% on MiniLM.

## Consumers

Found with `codegraph_explore` and confirmed with a string search for `applyRerank(` and `rerankPick(`. Every
reranking call site is one of these:

| consumer | shipped path driven | callers it stands for |
| - | - | - |
| memory recall | `recallMemory` with `mode: "mixC"` over the real search `digests` verb (`verbs/digests.ts:102`). An observer throws if the rerank degrades to vector order. | every chat turn with memory in mixC |
| Smart speaker pick | `rerankPick` with the reranker thunk shaped as `compose/chat.ts` `resolveSpeakerReranker` builds it | Smart group rounds |
| databank | `createGatherRetrieval` over `search.documents` with `rerank: true` (`verbs/documents.ts:144`) | the `{{databank}}` gather when the host turns rerank on |
| search omnibox | `search.search` with `rerank: true` for every target: `digests` (`verbs/search.ts:97`), `segments` mixC (`verbs/segments.ts:95`), `corpus` mixC (`verbs/corpus.ts:122`), `discover` (`verbs/discover.ts:232`), `entities` and `characters` (`verbs/knn.ts:61`), `documents`, `images` (`verbs/images.ts:62`) | the search page's rerank switch |

**Lore and world info do not rerank.** No file under `packages/server/src/domain/world-info` mentions `rerank`, and
activation is keyword-driven. The plugin `search.documents` bridge passes no `rerank` flag, so it never reranks
(`entry/compose/automation-plugin.ts:791`). `ChatContext.searchCorpus` is declared, but no domain code calls it.

## Method

- The real inference runtime (`createInferenceRuntime`) and the real connection service run over a fresh in-memory
  database built from the live schema (`freshDb`), never the dev database. The rerank role is the boot seed's
  binding: `seedLocalLightOnBoot`, then `roleClientsFor(principal).rerank`, which calls the executor and the
  local-light worker thread. For the 17m and MiniLM runs the user moves the seeded row to that model through
  `connection.update`, which is the Model roles pick.
- Only the query embedding is scripted. The corpus rows carry fixture vectors that put the wanted item **last** in
  vector order, so a consumer's top result shows the reranker's work and not the vector scan's.
- Corpus (`corpus.ts`): one caravan campaign. Six digest arcs (also seeded as the verbatim segments), four personas,
  a five-chunk gazetteer and four short portrait captions. Each long item is built in two shapes:
  - **lead:** the item names its subject in its second sentence, as a real summary, card or document section does;
  - **needle:** that sentence is dropped, so only the closing tells the item apart, and the closing sits after
    hundreds of tokens of campaign texture shared across the items.
- Item sizes, in ettin's tokenizer across both shapes: arcs are 863 to 949 tokens, with the closing starting at token
  843 to 881. Personas are 749 to 831 tokens, closing from token 725 to 792. Gazetteer chunks are 737 to 771 tokens,
  closing from token 718 to 748. MiniLM's counts are 2 to 3% lower (the `tokens` rows).
- Each model ran in its own process, so the RSS high-water mark is that model's.

## Per consumer

PASS means the wanted item came first, or for documents that it survived the `k = 2` cut, because the verb restores
reading order after the cut. "Long docs whole" counts documents over 2,000 characters that reached the reranker with
their late closing still in them.

| consumer | wiring (served model, window, no degrade, long docs whole) | 32m, lead | 32m, needle | 17m, lead | 17m, needle | MiniLM, lead | MiniLM, needle |
| - | - | - | - | - | - | - | - |
| memory recall (mixC) | pass | **pass** | fail | pass | fail | pass | fail |
| Smart speaker pick | pass (degraded: false) | **fail** (Maelis) | fail | fail | fail | fail | fail |
| databank gather | pass | **pass** | pass\* | pass | pass\* | pass | pass\* |
| omnibox: digests | pass | **pass** | fail | pass | fail | pass | fail |
| omnibox: segments (mixC) | pass | **pass** | fail | pass | fail | pass | fail |
| omnibox: corpus (mixC) | pass | **pass** | fail | pass | fail | pass | fail |
| omnibox: discover | pass | **pass** | fail | pass | fail | pass | fail |
| omnibox: entities | pass | **pass** | fail | pass | fail | pass | fail |
| omnibox: characters | pass | **pass** | fail | pass | fail | pass | fail |
| omnibox: documents | pass | **pass** | pass\* | pass | pass\* | pass | pass\* |
| omnibox: images (short captions) | pass | **pass** | n/a | pass | n/a | pass | n/a |

Wiring held in every run: `servedBy` is the bound model alone, the resolved window is 2,048 for ettin and 512 for
MiniLM, and no recall or Smart call degraded. Long docs whole: 116 of 116 on both ettin models and 108 of 108 on
MiniLM. Smart's `fitRerankPair` cuts personas to MiniLM's 512 window, as designed, so fewer documents count as long
there.

\* The needle chunk's opening line, "crossings and fords", still matches the ferry query, so these two cells do not
isolate the late fact. They do not count as evidence for reach.

The needle column fails for every model in the same way. Below is the reason.

## Reach: does a late fact still count?

`run.ts` `runReach` sends three documents through the same rerank role: the crossing arc's closing after *n* texture
sentences, the same prefix without it, and the closing moved to the front. The pair token where the closing starts is
in the `reach-tokens` rows.

| closing starts at pair token (ettin / MiniLM) | 32m served (with / without / first) | 32m PyTorch fp32 | 17m served = 17m PyTorch | MiniLM served |
| - | - | - | - | - |
| 27 / 25 | 9.90 / -1.10 / 9.90 | 10.44 / -1.30 / 10.44 | 10.59 / 0.36 / 10.59 | 6.59 / -10.64 / 6.59 |
| 114 / 110 | 9.72 / -1.02 / 9.65 | 10.48 / -1.86 / 10.18 | 10.59 / 1.23 / 10.49 | 2.07 / -11.41 / 4.94 |
| 206 / 200 | 9.81 / 0.36 / 9.84 | 10.21 / -0.40 / 10.13 | 9.75 / 3.44 / 10.33 | -9.51 / -11.35 / 4.39 |
| 254 / 246 | **4.54 / 4.38** / 9.38 | **5.04 / 4.26** / 10.08 | **6.00 / 5.95** / 10.27 | -3.90 / -11.28 / 4.63 |
| 305 / 297 | 3.86 / 4.23 / 9.59 | 4.69 / 4.34 / 10.05 | 5.95 / 5.87 / 10.24 | 0.22 / -11.27 / 4.67 |
| 399 / 387 | 3.82 / 3.46 / 9.36 | 4.49 / 4.43 / 10.00 | 6.14 / 5.86 / 10.24 | -2.63 / -10.10 / 4.75 |
| 490 / 478 | 3.50 / 3.30 / 9.31 | 4.78 / 4.94 / 10.00 | 6.17 / 5.76 / 10.22 | -0.57 / -9.47 / 4.33 |
| 538 / 526 | 5.27 / 5.05 / 8.85 | 5.20 / 4.99 / 10.01 | 6.17 / 5.70 / 10.22 | -9.30 / **-9.30** / 4.33 |
| 852 / 829 | 3.93 / 5.20 / 8.95 | 5.12 / 5.43 / 10.01 | 5.97 / 5.87 / 10.23 | -9.30 / **-9.30** / 4.33 |

The sweep steps every two sentences (about 50 tokens); all 19 depths are in the `meta` (`reach`) and `reference` rows.

- **Ettin.** Past about 250 pair tokens, "with" equals "without". The model still receives the late text: the two
  scores differ by a few tenths, and MiniLM's are bit-identical. But the fact no longer counts. The PyTorch column
  shows the same cliff (`reference.py`, `torch 2.14.1+cpu`), and the 17m serving matches PyTorch to two decimals.
- **MiniLM.** It still separates "with" from "without" by about 9 points at 478 tokens, then ties exactly once the
  closing passes its 512-token window. That tie is the truncation the swap set out to remove.

## Speaker-pick comparison

These are the speaker-pick probe's 30 cuts, 26 of them hand-judged. Reports: `speaker-pick/report.txt`; rows:
`speaker-pick/*.jsonl`.

| arm | agrees with reference best | in reference plausible set | hand-judged hit | latency median / max ms |
| - | - | - | - | - |
| MiniLM, mention then trigger (recorded baseline) | 66% | 97% | **73%** | 46 / 117 |
| **ettin-32m, mention then trigger** (`run.ts rerank --label=rerank-ettin32m-4c`) | 72% | 93% | **81%** | 35 / 149 |
| ettin-32m, trigger only | 69% | 83% | 85% | 35 / 149 |
| ettin-32m, trigger, last speaker banned | 62% | 93% | 69% | same |
| ettin-32m, ten-line window | 31% | 60% | 42% | 176 / 700 |

The shipped `rerankPick` scored on the same 26 judged cuts (`speakerPickCuts` in the `meta` rows): ettin-32m
**21 of 26 (81%)**, ettin-17m **24 of 26 (92%)**, MiniLM 19 of 26 (73%). No cut degraded. The arm loaded in 0.54 s, and
its RSS rose 107 MiB over the process baseline.

## Seed behaviour, through `seedLocalLightOnBoot`

Each scenario is a user in one database, and one boot sweep covers them all. "Served" is the model id the role's
`rerank` call returned. Each call also ranked Mars over Venus on a sanity pair.

| scenario | result |
| - | - |
| fresh install | **pass**: the seeded "Built-in reranker" row is on ettin-32m with `seed_model` ettin-32m, the rerank binding points at it, it serves ettin-32m, window 2,048 |
| upgrade: MiniLM in the seed slot, `seed_model` NULL | **pass**: the same row id moved to ettin-32m and the binding followed it |
| upgrade: an unslotted MiniLM row under the earlier label "local-light · reranker", bound | **pass**: adopted into the slot, relabelled, moved, still bound, serves ettin-32m |
| the user's own MiniLM row ("My reranker"), bound | **pass**: never adopted or moved, still bound, serves MiniLM; the seed added a separate unbound slot row |
| fresh install, then a MiniLM pick on the seeded row, then a reboot | **pass**: the row stays on MiniLM (`seed_model` stays ettin-32m) and serves MiniLM at 512 |
| upgraded slot row, then a MiniLM pick, then a reboot | **pass**: same |

The first boot inserted 5 rows and the reboot inserted 0. A user-made rerank row must have `allowBackground` set
before `setBinding` accepts it for rerank (`backgroundRefused`). That is product behaviour, and the probe sets it.

## Cost

| model | first call, cache on disk (load and score 6 arcs) | per call, median / max (recall 6 arcs, Smart 4 personas, databank 5 chunks, omnibox) | peak process RSS | cold first call: download, load and score (empty cache) | download as served |
| - | - | - | - | - | - |
| **ettin-32m (default)** | 1.56 s | recall 1.56 s; Smart 0.58 s; databank 0.68 s; omnibox 0.96 / 2.05 s (24 documents) | **721 MiB** (413 before the first call) | 20.6 s | 34.9 MB |
| ettin-17m fp32 | 0.97 s | recall 0.97 s; Smart 0.29 s; databank 0.34 s; omnibox 0.47 / 1.03 s | 826 MiB (413 before) | 40.1 s | 67.9 MB |
| MiniLM fp32 | 0.75 s | recall 0.75 s; Smart 0.19 s; databank 0.37 s; omnibox 0.40 / 0.81 s | 961 MiB (411 before) | 52.8 s | 87.5 MB |

The recall figure is a single call that includes the load, and the second recall call is in the omnibox digests row.
The "before" RSS is the process with its database, runtime and worker but no model; it includes the test harness
modules. Cold times are dominated by the Hugging Face download on this link, and a second call takes 6 to 33 ms.
MiniLM's higher peak comes from its fp32 attention over 512-token batches against ettin's one pair per pass.

## For the wiki

The built-in reranker (`ettin-reranker-32m-v1`) is a 35 MB download that takes about 20 s on first use. A reranking
process peaks at about 0.7 GB, 0.3 GB of it the model at work. On 4 CPU cores a memory recall over 6 long arcs takes
about 1.5 s and a Smart pick about 0.6 s. It reads up to 2,048 tokens of each item, but in practice it ranks on about
the first 250 tokens, so put what matters at the top of a summary, card or document section.
