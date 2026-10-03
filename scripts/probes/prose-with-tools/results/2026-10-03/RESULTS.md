# Prose with tool calls, 2026-10-03

> \[!WARNING]
> This run used the hand-built `probe.ts` request, not what the app sends, and forced thinking off where the app does not. [INVESTIGATION.md](INVESTIGATION.md) replaces its verdict.

Ten folded RPG turns per cell and stream mode, built with `probe.ts`. The raw
turns are in `<cell>.<mode>.r<rep>.json`, the per-run summaries in `cells.jsonl`. The table is
`node scripts/probes/prose-with-tools/summarize.ts` over this directory.

## Verdict

For folded RPG on llama.cpp, start the server with `--no-reasoning-preserve`. With its default, an empty think block before every earlier reply holds co-emission near 22–25% ([INVESTIGATION.md](INVESTIGATION.md)).

Qwen3.8-27B co-emits prose and tool calls on vLLM, llama.cpp, Ollama, and KoboldCpp with `--jinja_tools`.
No 27B turn came back empty, errored, or leaked call markup into the prose. The rate varies by turn
(20% to 80% of turns per cell), and the misses split into tools-only and prose-only turns, which the app
already recovers losslessly (the engine's narrative recovery pass, and the post-commit round).

The small models (Qwen2.5-0.5B, Qwen3-1.7B, Llama 3.2 3B) never co-emitted, and Qwen2.5-0.5B returned empty
replies, so they stay closed. Llama 3.2 3B leaked call markup into its prose on 9 of 20 turns.

KoboldCpp in its default tool mode (no `--jinja_tools`) answered tools-only on 20 of 20 turns, as its source
predicts: it forces a tool-call grammar. The API does not report which mode a server runs, so KoboldCpp gets
no row and stays closed.

Rows written (`packages/inference/src/capability/sources/measured/local-servers.ts`), each
`tools: { parallel: true, silencesProse: false }` for model ids matching `(^|/)qwen3\.8[-:]27b`:

- `vllm`
- `llama-cpp`
- `ollama`

## Bar

A cell earns `silencesProse: false` when both stream modes co-emit on at least 20% of turns with no empty
reply, error, or leaked call markup. Folded costs one call on a co-emitting turn and two on a miss; the cheap
round always costs two. Any real co-emission rate is therefore a saving, and only an empty reply, an error or
a leak loses output.

## Table

| Cell | Server | Model | Template | Mode | Reps | Both | Prose only | Tools only | Empty | Errors | Leaks | Max prompt tok | tok/s (client) | tok/s (server) |
| - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| vllm-27b-qwen3coder | vllm | qwen3.8-27b | served | stream | 3 | 16/30 (53%) | 3 | 11 | 0 | 0 | 0 | 4745 | 34.7 / 37.5 / 37 | - |
| vllm-27b-qwen3coder | vllm | qwen3.8-27b | served | nonstream | 3 | 12/30 (40%) | 3 | 15 | 0 | 0 | 0 | 4806 | 33.8 / 35.8 / 33.9 | - |
| vllm-27b-qwen3xml | vllm | qwen3.8-27b | served | stream | 1 | 8/10 (80%) | 0 | 2 | 0 | 0 | 0 | 4745 | 34.5 | - |
| vllm-27b-qwen3xml | vllm | qwen3.8-27b | served | nonstream | 1 | 2/10 (20%) | 1 | 7 | 0 | 0 | 0 | 4640 | 33.8 | - |
| llamacpp-27b-served | llama-cpp | Qwen3.8-27B-UD-Q4_K_M.gguf | served | stream | 1 | 6/10 (60%) | 1 | 3 | 0 | 0 | 0 | 4778 | 31.4 | 34.4 |
| llamacpp-27b-served | llama-cpp | Qwen3.8-27B-UD-Q4_K_M.gguf | served | nonstream | 1 | 3/10 (30%) | 5 | 2 | 0 | 0 | 0 | 4587 | 26.7 | 34.5 |
| llamacpp-27b-stock | llama-cpp | Qwen3.8-27B-UD-Q4_K_M.gguf | stock | stream | 1 | 3/10 (30%) | 4 | 3 | 0 | 0 | 0 | 4657 | 24.4 | 33.8 |
| llamacpp-27b-stock | llama-cpp | Qwen3.8-27B-UD-Q4_K_M.gguf | stock | nonstream | 1 | 7/10 (70%) | 3 | 0 | 0 | 0 | 0 | 4732 | 30.9 | 34.1 |
| ollama-27b-gpu | ollama | qwen3.8-27b | GGUF's embedded | stream | 1 | 4/10 (40%) | 6 | 0 | 0 | 0 | 0 | 4330 | 21 | 33.7 |
| ollama-27b-gpu | ollama | qwen3.8-27b | GGUF's embedded | nonstream | 1 | 3/10 (30%) | 5 | 2 | 0 | 0 | 0 | 4307 | 23.5 | - |
| kobold-27b-jinjatools | koboldcpp | koboldcpp/Qwen3.8-27B-UD-Q4_K_M | served | stream | 1 | 3/10 (30%) | 4 | 3 | 0 | 0 | 0 | 4654 | 20.4 | - |
| kobold-27b-jinjatools | koboldcpp | koboldcpp/Qwen3.8-27B-UD-Q4_K_M | served | nonstream | 1 | 4/10 (40%) | 5 | 1 | 0 | 0 | 0 | 4613 | 19 | - |
| kobold-27b-injection | koboldcpp | koboldcpp/Qwen3.8-27B-UD-Q4_K_M | served + Kobold tool injection | stream | 1 | 0/10 (0%) | 0 | 10 | 0 | 0 | 0 | 4163 | 12.5 | - |
| kobold-27b-injection | koboldcpp | koboldcpp/Qwen3.8-27B-UD-Q4_K_M | served + Kobold tool injection | nonstream | 1 | 0/10 (0%) | 0 | 10 | 0 | 0 | 0 | 4119 | 13.5 | - |
| llamacpp-qwen25-0.5b-cpu | llama-cpp | qwen2.5-0.5b-instruct-q4_k_m.gguf | GGUF's embedded | stream | 1 | 0/10 (0%) | 7 | 1 | 2 | 0 | 0 | 4232 | 9.5 | 25.5 |
| llamacpp-qwen25-0.5b-cpu | llama-cpp | qwen2.5-0.5b-instruct-q4_k_m.gguf | GGUF's embedded | nonstream | 1 | 0/10 (0%) | 8 | 1 | 1 | 0 | 0 | 4232 | 3.5 | 10.1 |
| ollama-qwen25-0.5b-cpu | ollama | qwen2.5:0.5b | Ollama library | stream | 1 | 0/10 (0%) | 0 | 7 | 3 | 0 | 0 | 3572 | 4.2 | 25.9 |
| ollama-qwen25-0.5b-cpu | ollama | qwen2.5:0.5b | Ollama library | nonstream | 1 | 0/10 (0%) | 0 | 6 | 4 | 0 | 0 | 3572 | 3.7 | - |
| ollama-qwen3-1.7b-cpu | ollama | qwen3:1.7b | Ollama library | stream | 1 | 0/10 (0%) | 9 | 1 | 0 | 0 | 0 | 3637 | 5.4 | 11 |
| ollama-qwen3-1.7b-cpu | ollama | qwen3:1.7b | Ollama library | nonstream | 1 | 0/10 (0%) | 9 | 1 | 0 | 0 | 0 | 3647 | 5.9 | - |
| ollama-llama32-3b-cpu | ollama | llama3.2:3b | Ollama library | stream | 1 | 0/10 (0%) | 7 | 3 | 0 | 0 | 4 | 3531 | 1.1 | 7 |
| ollama-llama32-3b-cpu | ollama | llama3.2:3b | Ollama library | nonstream | 1 | 0/10 (0%) | 8 | 2 | 0 | 0 | 5 | 3554 | 7.5 | - |

- tok/s (client) is end to end per turn (completion tokens over request time, prefill included), the median
  per repeat. tok/s (server) is the server's own decode rate where it reports one
  (`timings.predicted_per_second`). Ollama and KoboldCpp send a tool call as one late chunk, so a streamed decode
  window means nothing there; the end-to-end figure is the comparable one.
- Every window held the whole prompt: the largest prompt was 4806 tokens against a 16384-token window on every
  server, and every reply under its 1200-token cap except the small CPU models' runaway prose
  (`finish: length`). No cell was truncated.
- Repeats: the vLLM qwen3_coder cell ran three times because its first run showed the widest stream gap
  (8/10 against 2/10). The qwen3_xml cell's single run produced the same per-turn shapes as the qwen3_coder
  first run, so on these turns the parser choice did not change what reached the client.

## Servers and argv

All servers bound 127.0.0.1 only, ran one model each, and were torn down after the run.

| Cell | Device | Version | Launch |
| - | - | - | - |
| vllm-27b-qwen3coder | GPU 1 (A6000), TP 1 | vLLM 0.29.0 (`~/qwen-local/.venv-vllm`) | see below |
| vllm-27b-qwen3xml | GPU 1, TP 1 | same | same, `--tool-call-parser qwen3_xml` |
| llamacpp-27b-served | GPU 0, 66/66 layers (GPU 0 rose 5 to 21.6 GiB) | `ghcr.io/ggml-org/llama.cpp:server-cuda` b11371 | `--gpus device=0 -m Qwen3.8-27B-UD-Q4_K_M.gguf --chat-template-file chat_template.served.jinja --jinja -ngl 99 -c 16384` |
| llamacpp-27b-stock | GPU 0 | same | same with `chat_template.stock.jinja` |
| kobold-27b-jinjatools | GPU 0, `offloaded 66/66 layers to GPU` | `koboldai/koboldcpp:latest` (image 2026-09-14) | `--gpus device=0`, `KCPP_ARGS=--model …gguf --contextsize 16384 --usecuda --gpulayers 999 --jinja --jinja_tools --jinjatemplate chat_template.served.jinja --jinjathink false` |
| kobold-27b-injection | GPU 0, 66/66 | same | same without `--jinja_tools` (Kobold's own tool injection) |
| ollama-27b-gpu | GPU 1, `ollama ps`: 100% GPU, context 16384 | Ollama 0.35.1 | `--gpus device=1`, `OLLAMA_CONTEXT_LENGTH=16384`, Modelfile `FROM Qwen3.8-27B-UD-Q4_K_M.gguf` + `PARAMETER num_ctx 16384` |
| llamacpp-qwen25-0.5b-cpu | CPU (8 threads) | `ghcr.io/ggml-org/llama.cpp:server` | `-m qwen2.5-0.5b-instruct-q4_k_m.gguf --jinja -c 16384 -t 8` |
| ollama-\*-cpu | CPU (`--cpus 8`) | Ollama 0.35.1 | `OLLAMA_CONTEXT_LENGTH=16384`, library pulls `qwen2.5:0.5b`, `qwen3:1.7b`, `llama3.2:3b` |

vLLM, mirroring `~/qwen-local/bin/serve-27b.sh`:

```sh
CUDA_VISIBLE_DEVICES=1 ~/qwen-local/.venv-vllm/bin/vllm serve \
  /media/inktomi/Data/vllm-models/quantized/Qwen3.8-27B-W8A8-Dynamic-Per-Token \
  --served-model-name qwen3.8-27b <model path> --tensor-parallel-size 1 --host 127.0.0.1 --port 28130 \
  --gpu-memory-utilization 0.92 --max-num-batched-tokens 8192 --max-model-len 16384 --max-num-seqs 16 \
  --reasoning-parser qwen3 --chat-template ~/qwen-local/templates/qwen3_gen_thinking_serve.jinja \
  --default-chat-template-kwargs '{"enable_thinking": false, "preserve_thinking": false}' \
  --structured-outputs-config '{"enable_in_reasoning": false}' \
  --enable-auto-tool-choice --tool-call-parser qwen3_coder \
  --speculative-config '{"method":"mtp","num_speculative_tokens":2}' --enable-prefix-caching \
  --mm-encoder-tp-mode data --mm-processor-cache-type shm \
  --disable-access-log-for-endpoints /health,/metrics,/ping --enable-request-id-headers --enable-force-include-usage
```

Deviations from `serve-27b.sh`: tensor parallel 1 on GPU 1 only, port 28130, `--max-model-len 16384`,
`--gpu-memory-utilization 0.92`, and `--max-num-seqs 16`. The last one is new: at the default 256 the engine
refused to start ("max_num_seqs (256) exceeds available Mamba cache blocks (194)") on one card. MTP fit and
stayed on.

Templates: `served` is `chat_template.served.jinja`, byte-identical to
`~/qwen-local/templates/qwen3_gen_thinking_serve.jinja`; `stock` is Qwen's `chat_template.stock.jinja`. The
Ollama Modelfile shows `TEMPLATE {{ .Prompt }}`, and `ollama show --template` prints the GGUF's embedded
Unsloth jinja, which is what rendered; Ollama reported `tools` and `thinking` capabilities for it.

Request bodies: thinking off in every cell, as the app sends it with no effort set (vLLM through the launch
default, llama.cpp through `chat_template_kwargs.enable_thinking: false`, KoboldCpp through
`--jinjathink false`, Ollama through `reasoning_effort: "none"`). The Ollama cells used
`/v1/chat/completions`; the app's Ollama row talks to `/api/chat`, which runs the same model parser.

## Not run

- LM Studio: not on the rig.
- Ollama with a library build of Qwen3.8-27B (Ollama's own renderer and parser): the measurement covers the
  GGUF imported from a file. The row matches `qwen3.8:27b` too, on the strength of the same model and server.
