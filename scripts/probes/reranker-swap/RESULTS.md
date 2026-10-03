# Reranker-swap results (work item 0514)

**Run:** 2026-10-03, x64, every run pinned to 4 cores (`taskset -c 0-3`, so `localLightCpuThreads()` = 4).
Evidence: `results/*.json`. Method: [`README.md`](README.md). The host was loaded throughout (load average 15
to 22 on 24 cores, sibling lanes running), so repeated cells vary by about ±30% and every time is an upper bound.
The `shipped-*` rows ran through the final code: curated `rerank.onnx`, the window clamp and the micro-batching.

## Decision

- **Default:** `cross-encoder/ettin-reranker-32m-v1`, `model_quint8_avx2.onnx` (arm64: `model_qint8_arm64.onnx`,
  untested), served window **2048**.
- **Light option:** `cross-encoder/ettin-reranker-17m-v1` at **fp32**. Its quantized file fails quality (below).
- **Kept selectable:** `Xenova/ms-marco-MiniLM-L-6-v2` (window 512), now served at q8.
- **Rejected:** `Alibaba-NLP/gte-reranker-modernbert-base` costs 4 to 8 times the 32m per turn for no measured
  gain; `jinaai/jina-reranker-v1-{tiny,turbo}-en` fail the long-range fact; `ettin-68m` costs about twice the 32m.

## Why no 8192 window

No candidate is linear in attention on ONNX CPU. The gte q8 export has 22 `Softmax` nodes, every one shaped
`[batch, heads, seq, seq]`: ModernBERT's 128-token local layers are exported as a mask over full attention, and
the ettin models are the same architecture. One gte pair costs 18 s and 3.1 GB at 4,096 tokens and 74 s and
11.6 GB at 8,192; jina v1 (ALiBi) peaked at 17.4 GB at 8,192. The served window is a curated row value, so
raising it is a one-number change once a box can afford it.

## Quality

Sanity: relevant beats irrelevant on a short Q&A, a persona pick, and a fact placed after 1,200 tokens of shared
filler. Golden: the card's four passages; the correct order is Mars > Saturn > Jupiter > Venus.

| model and file | short Q&A | persona | fact past 1,200 tokens | golden scores (Venus, Mars, Jupiter, Saturn) | golden order |
| - | - | - | - | - | - |
| ettin-32m fp32 | pass | pass | pass | 6.21, 10.82, 8.55, 9.86 (card: 6.22, 10.81, 8.56, 9.88) | right |
| **ettin-32m quint8_avx2 (default)** | pass | pass | pass | 6.93, 10.64, 8.34, 9.40 | right |
| ettin-68m quint8_avx2 | pass | pass | pass | 5.30, 11.43, 6.66, 10.48 | right |
| **ettin-17m fp32 (light)** | pass | pass | pass | 6.58, 10.53, 8.55, 10.03 | right |
| ettin-17m quint8_avx2 | pass | **fail** | **fail** | 6.38, 10.51, 9.24, 10.53 | **wrong** (Saturn over Mars) |
| gte-modernbert q8 | pass | pass (thin: 1.75 vs 1.57) | pass | 1.16, 2.42, 1.86, 2.04 | right |
| jina-v1-tiny / turbo q8 | pass | pass / pass | **fail** / **fail** | not run | |
| MiniLM q8 | pass | pass | **tie** (both documents truncated to the same 512 tokens) | -6.86, 9.70, 6.82, 6.68 | wrong (Jupiter over Saturn) |

The 32m fp32 golden matches the card to two decimals, which pins the head arithmetic in
`backends/local-light/st-head.ts`.

## Per pair (batch 1, 4 cores)

| model | 512 tokens | 2,048 | 4,096 | weights on disk |
| - | - | - | - | - |
| ettin-17m fp32 | 33–60 ms | 306–576 ms | 1.0–2.0 s, peak 1.3 GB | 67 MB |
| ettin-32m quint8 | 74–130 ms | 0.74–1.2 s | 3.1–3.9 s, peak 1.7 GB | 32 MB |
| ettin-68m quint8 | 213 ms | 1.7 s | 5.8 s, peak 1.9 GB | 69 MB |
| gte-modernbert q8 | 560 ms | 3.3 s | 18 s, peak 3.1 GB | 151 MB |
| gte-modernbert fp32 | 2.1 s | 9.8 s | not run | 599 MB |
| MiniLM q8 | 37–117 ms | (truncated to 512) | | 23 MB |

Ranges are repeated runs on the loaded host. Batch 8 at 2,048 tokens without micro-batching peaked at 5.9 GB on
gte, which is why `scorePairs` now caps a forward pass at 2,048 token cells.

## Per turn, at the served window (one `scorePairs` call, 4 cores)

| model (window) | Smart 4 × 500 | Smart 6 × 1,500 | recall 8 × 400 | recall 8 × 1,024 | peak RSS at the served window |
| - | - | - | - | - | - |
| **ettin-32m (2048)** | 0.4–0.6 s | 3.2–5.0 s | 1.4–2.5 s | 3.5–5.4 s | about 0.72 GB process, 0.6 GB over baseline |
| **ettin-17m fp32 (2048)** | 0.16–0.31 s | 1.2–2.1 s | 0.5–1.1 s | 1.8–2.5 s | about 0.62 GB process |
| ettin-68m (2048) | 1.0 s | 11.2 s | 6.2 s | 14.9 s | 0.74 GB |
| gte q8 (2048) | 2.4 s | 18.1 s | 8.0 s | 23.7 s | 0.95 GB |
| MiniLM q8 (512) | 0.15–0.23 s | 0.25–0.34 s | 0.30–0.63 s | 0.33–0.47 s | 0.47 GB |

The process baseline is about 105 MB (an idle Node process). Real dev personas run 75 to 2,841 characters (about
20 to 700 tokens), so Smart usually sits in the 4 × 500 column. Recall reranks `retrieveK` = 8 digests; the dev
database held no digests, so the arc sizes bracket the summarizer's 1,024-token ceiling.

## For the wiki (Install and Connect-a-Model)

The built-in reranker is now `ettin-reranker-32m-v1`: a 37 MB download (the quantized ONNX plus tokenizer and
head), about 150 MB resident once loaded, and up to about 0.6 GB more while it scores a turn at its 2,048-token
window on CPU. A typical turn takes 0.5 to 2.5 s on 4 cores; the worst case (8 long memory arcs) is about
5 s. On a small box, pick `ettin-reranker-17m-v1` (67 MB, roughly half the time) or the older
`ms-marco-MiniLM-L-6-v2` (23 MB, under 0.5 s a turn, but it reads only the first 512 tokens of each pair).
