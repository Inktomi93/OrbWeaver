# Reranker-swap probe (work item 0514)

Which built-in reranker replaces `Xenova/ms-marco-MiniLM-L-6-v2` (512-token window), and at what served window?
Read the findings first: [`RESULTS.md`](RESULTS.md).

## What runs

`run.ts measure` loads one model through the shipped local-light `createModelCache` (the same `preload` and
`scorePairs` the rerank task calls, including the micro-batching) with the model's curated `rerank.onnx`
serving, one model per process so the RSS high-water mark is that model's alone. It records:

- **sanity:** three relevant-versus-irrelevant pairs: a short question and answer, a Smart-style persona pick,
  and a fact placed after about 1,200 tokens of shared filler (past MiniLM's window, so a 512 model scores both
  documents identically);
- **golden:** the ettin model cards' four-passage Red Planet example (the 32m card prints
  `[6.21875, 10.8125, 8.5625, 9.875]`, bf16 on GPU);
- **latency:** per-pair time at the `--lengths=` pair sizes, `--batch=` pairs per call;
- **workloads:** with `--window=<served window>`, one call per turn shape cut to that window: Smart with 4 × 500
  and 6 × 1,500-token personas, recall with 8 × 400 and 8 × 1,024-token digest arcs (`retrieveK` is 8, and a digest
  is at most the summarizer's 1,024 output tokens).

The run exits non-zero if any sanity or golden score is not finite.

## Running it

```sh
# 4 cores, the small-box shape; weights come from (and download into) the dev model cache
taskset -c 0-3 node scripts/probes/reranker-swap/run.ts measure --model=cross-encoder/ettin-reranker-32m-v1 \
  --label=shipped-ettin32m --batch=1 --window=2048 --lengths=512,2048,4096
# a non-curated file at fp32 (how the quantized 17m was measured)
taskset -c 0-3 node scripts/probes/reranker-swap/run.ts measure --model=cross-encoder/ettin-reranker-17m-v1 \
  --file=model_quint8_avx2 --label=ettin17m-q8 --batch=1 --lengths=512
```

Each run writes `results/<label>.json`. `--offline` keeps remote loads off; `--cache=<dir>` points elsewhere.
