// buildEngineArgv — THE per-engine `vllm serve` incantation, as a PURE function. Formerly the case-arms of
// scripts/dev/vllm-engine.sh; now the ONE home both engine owners share:
//   • the in-server adoptive supervisor (spawnOwned) — composes EffectiveAppConfig, passes the launch slice;
//   • the standalone dev launcher (scripts/dev/engines.ts) — resolves the same layering, calls this.
// Keeping it pure (config injected, never reading env/DB itself) makes it argv-snapshot unit-testable and
// keeps the two owners from ever drifting (the old "keep flags in the .sh" comment is now a type).
//
// TRUTH ORDER for every launch value: an admin AppSettings override ?? the env floor ?? the code default
// (resolveEngineLaunchConfig, mirroring the layer.ts vllmConcurrency precedent). DEPLOYMENT facts
// (model store path, served-model paths) are resolved by the CALLER and passed in — this file is
// gpu-count + config → argv, nothing else.
//
// Flag provenance (grounded 2026-06-11, preserved from the shell header):
//   embed : EOS serve template (cookbook pooling), is_matryoshka (MRL dims), pooling max_pixels vision cap.
//   rerank: local-snapshot serving, yes/no classifier overrides, vLLM score template, pooling max_pixels.
//           Context window is a SERVE choice (model is 32K-doc / 262K-positional); the runner truncates
//           query+doc to fit it, so a long doc can never exceed --max-model-len.
//   gen   : TP=2 on 2-GPU boxes (NVLink ~1.8×), gen max_pixels; --enable-auto-tool-choice +
//           --tool-call-parser qwen3_coder (was `hermes` under Qwen3-VL; the thinking checkpoint's chat
//           template emits the qwen3_coder <tool_call><function=…> shape) for the buddy agent's
//           /v1/messages tool loop; --reasoning-parser qwen3 + structured-outputs enable_in_reasoning;
//           --served-model-name
//           registers BOTH the full HF id AND the slash-free leaf alias (Claude Code can't resolve a "/").
// GPU budget (2-card): GPU0 = embed + gen-half; GPU1 = gen-half + rerank (rerank OFF GPU0 so an
// embed-then-rerank search doesn't serialize on one card). Single-GPU: everything on GPU0.

import type { VLLM_ENGINES } from "./engines.ts";

type VllmEngine = (typeof VLLM_ENGINES)[number];

/** The launch-tier config an admin can move (AppSettings-layered) — the values that change the serve argv
 *  and only take effect on an engine RESTART. Every field is the RESOLVED value (override ?? env ?? default
 *  already applied by resolveEngineLaunchConfig); the builder consumes concrete numbers/strings. */
export interface EngineLaunchConfig {
  readonly embedModel: string;
  readonly rerankModel: string;
  readonly genModel: string;
  readonly embedMaxModelLen: number;
  readonly rerankMaxModelLen: number;
  readonly genMaxModelLen: number;
  readonly embedGpuUtil: number;
  readonly rerankGpuUtilMulti: number;
  readonly rerankGpuUtilSingle: number;
  readonly genGpuUtilMulti: number;
  readonly genGpuUtilSingle: number;
  readonly poolingMaxPixels: number;
  readonly genMaxPixels: number;
  /** The gen engine's repetition_penalty, emitted as `--override-generation-config` (#23). The Qwen3-VL card
   *  ships 1.0 (no penalty → the sampler-less agent-sdk wire loops to the output cap); 1.05 is the launch
   *  default that stops it. Only gen carries a value today — see GENERATION_CONFIG_OVERRIDES. */
  readonly genRepetitionPenalty: number;
  /** Emit `--enable-sleep-mode` on every engine (force-enables vLLM's cumem allocator so /sleep can pin
   *  weights→CPU and free VRAM on idle). Resolved `override ?? env floor` (VLLM_SLEEP_MODE), default true.
   *  Paired with `VLLM_SERVER_DEV_MODE=1` on the child (spawn-engine.ts) to register the loopback /sleep,
   *  /wake_up, /is_sleeping endpoints — loopback bind is already enforced by `--host 127.0.0.1`. */
  readonly sleepMode: boolean;
  /** The ENGINE-SIDE flight recorder (VLLM_DEBUG_REQUESTS, default off). On, adds --enable-log-requests
   *  --enable-log-outputs --max-log-len 2048: wire captures show what WE sent, these show what the engine
   *  PARSED (post-chat-template, post-tool-parser) — the gap where tool-call debugging burned time. */
  readonly debugRequests: boolean;
  /** `--shutdown-timeout N` — a graceful in-flight drain window on engine shutdown. `0` (default) keeps
   *  today's immediate-abort behavior; a positive value lets engines:stop drain first (VLLM_SHUTDOWN_TIMEOUT_S). */
  readonly shutdownTimeoutS: number;
  readonly ports: { readonly embed: number; readonly rerank: number; readonly gen: number };
}

/** The env floor the resolver reads (a structural subset of `env`, kept file-local — no-inline-types-clean,
 *  like the resolver's `WireShape`). The overrides source is the layered AppSettings launch slice. */
export interface EngineLaunchEnvFloor {
  readonly VLLM_EMBED_MODEL: string;
  readonly VLLM_RERANK_MODEL: string;
  readonly VLLM_GEN_MODEL: string;
  readonly VLLM_EMBED_MAX_MODEL_LEN: number;
  readonly VLLM_RERANK_MAX_MODEL_LEN: number;
  readonly VLLM_GEN_MAX_MODEL_LEN: number;
  readonly VLLM_EMBED_GPU_UTIL: number;
  readonly VLLM_RERANK_GPU_UTIL_MULTI: number;
  readonly VLLM_RERANK_GPU_UTIL_SINGLE: number;
  readonly VLLM_GEN_GPU_UTIL_MULTI: number;
  readonly VLLM_GEN_GPU_UTIL_SINGLE: number;
  readonly VLLM_POOLING_MAX_PIXELS: number;
  readonly VLLM_GEN_MAX_PIXELS: number;
  readonly VLLM_GEN_REPETITION_PENALTY: number;
  readonly VLLM_SLEEP_MODE: boolean;
  readonly VLLM_DEBUG_REQUESTS: boolean;
  readonly VLLM_SHUTDOWN_TIMEOUT_S: number;
  readonly VLLM_EMBED_PORT: number;
  readonly VLLM_RERANK_PORT: number;
  readonly VLLM_GEN_PORT: number;
}

/** The admin AppSettings launch override — every field nullable+optional (null=CLEAR, falls to env floor).
 *  Mirrors the vllmConcurrency override shape; the resolver applies `override ?? floor`. */
export interface EngineLaunchOverride {
  readonly embedModel?: string | null | undefined;
  readonly rerankModel?: string | null | undefined;
  readonly genModel?: string | null | undefined;
  readonly embedMaxModelLen?: number | null | undefined;
  readonly rerankMaxModelLen?: number | null | undefined;
  readonly genMaxModelLen?: number | null | undefined;
  readonly embedGpuUtil?: number | null | undefined;
  readonly rerankGpuUtilMulti?: number | null | undefined;
  readonly rerankGpuUtilSingle?: number | null | undefined;
  readonly genGpuUtilMulti?: number | null | undefined;
  readonly genGpuUtilSingle?: number | null | undefined;
  readonly poolingMaxPixels?: number | null | undefined;
  readonly genMaxPixels?: number | null | undefined;
  readonly genRepetitionPenalty?: number | null | undefined;
  readonly sleepMode?: boolean | null | undefined;
  readonly debugRequests?: boolean | null | undefined;
  readonly shutdownTimeoutS?: number | null | undefined;
}

/** The launch flags whose `??` coalesce is lifted out of the main resolver so their operators don't count
 *  against its cognitive-complexity budget. Booleans where `false` is a real override (`?? floor` is correct
 *  — only null/undefined falls through); the shutdown timeout is a plain number. */
function resolveExtraLaunch(
  floor: EngineLaunchEnvFloor,
  o: EngineLaunchOverride,
): Pick<EngineLaunchConfig, "sleepMode" | "debugRequests" | "shutdownTimeoutS"> {
  return {
    sleepMode: o.sleepMode ?? floor.VLLM_SLEEP_MODE,
    debugRequests: o.debugRequests ?? floor.VLLM_DEBUG_REQUESTS,
    shutdownTimeoutS: o.shutdownTimeoutS ?? floor.VLLM_SHUTDOWN_TIMEOUT_S,
  };
}

/** Resolve the launch config: `admin override ?? env floor` per field (the layer.ts precedent). Ports stay
 *  env-only (DEPLOYMENT facts — displayed, never admin-edited). Pure. */
export function resolveEngineLaunchConfig(floor: EngineLaunchEnvFloor, override?: EngineLaunchOverride | null): EngineLaunchConfig {
  const o = override ?? {};
  const extra = resolveExtraLaunch(floor, o);
  return {
    embedModel: o.embedModel ?? floor.VLLM_EMBED_MODEL,
    rerankModel: o.rerankModel ?? floor.VLLM_RERANK_MODEL,
    genModel: o.genModel ?? floor.VLLM_GEN_MODEL,
    embedMaxModelLen: o.embedMaxModelLen ?? floor.VLLM_EMBED_MAX_MODEL_LEN,
    rerankMaxModelLen: o.rerankMaxModelLen ?? floor.VLLM_RERANK_MAX_MODEL_LEN,
    genMaxModelLen: o.genMaxModelLen ?? floor.VLLM_GEN_MAX_MODEL_LEN,
    embedGpuUtil: o.embedGpuUtil ?? floor.VLLM_EMBED_GPU_UTIL,
    rerankGpuUtilMulti: o.rerankGpuUtilMulti ?? floor.VLLM_RERANK_GPU_UTIL_MULTI,
    rerankGpuUtilSingle: o.rerankGpuUtilSingle ?? floor.VLLM_RERANK_GPU_UTIL_SINGLE,
    genGpuUtilMulti: o.genGpuUtilMulti ?? floor.VLLM_GEN_GPU_UTIL_MULTI,
    genGpuUtilSingle: o.genGpuUtilSingle ?? floor.VLLM_GEN_GPU_UTIL_SINGLE,
    poolingMaxPixels: o.poolingMaxPixels ?? floor.VLLM_POOLING_MAX_PIXELS,
    genMaxPixels: o.genMaxPixels ?? floor.VLLM_GEN_MAX_PIXELS,
    genRepetitionPenalty: o.genRepetitionPenalty ?? floor.VLLM_GEN_REPETITION_PENALTY,
    ...extra,
    ports: { embed: floor.VLLM_EMBED_PORT, rerank: floor.VLLM_RERANK_PORT, gen: floor.VLLM_GEN_PORT },
  };
}

/** The chat-template / classifier files the pooling engines serve with — relative to the repo root the
 *  caller resolves (DEPLOYMENT fact). Kept beside the arms that use them. */
const EMBED_CHAT_TEMPLATE_REL = "scripts/dev/qwen3_vl_embedding_serve.jinja";
const RERANK_CHAT_TEMPLATE_REL = "scripts/dev/qwen3_vl_reranker_serve.jinja";
// The gen engine's FIXED chat template (vendored 2026-08-13 from froggeric/Qwen-Fixed-Chat-Templates,
// sha256 398edf5b…f78dc; owner-directed). The checkpoint's SHIPPED template has four defects this repo
// hits directly: (1) mid-dialogue system messages get dropped — our injection system / author's-note
// INSERTS them; (2) tool-call `arguments` as JSON strings (the standard OpenAI wire — what our client
// sends) crash it; (3) multi-turn history gets blank `<think></think>` poisoning → prefix-cache misses;
// (4) `enable_thinking:false` support is fragile across the 3.5/3.6/3.8 family. The fixed template reads
// the SAME kwargs we already emit below (`enable_thinking`, `preserve_thinking`) plus per-request
// `reasoning_effort` (xhigh|medium|low, default xhigh), and preserves prior thoughts chronologically so
// rendered history matches cached tokens (the 100%-prefix-hit property).
const GEN_CHAT_TEMPLATE_REL = "scripts/dev/qwen3_gen_thinking_serve.jinja";

const LOOPBACK_HOST = "127.0.0.1";
const MULTI_GPU_THRESHOLD = 2;

/** The per-invocation facts the caller resolves (DEPLOYMENT tier — model store paths, repo root) and the
 *  detected GPU count. `rerankModelPath` is the snapshot-resolved local path (transformers 5.x hub-cache
 *  crash workaround); `embedModel`/`genModel` serve by id straight from the config. */
export interface EngineArgvContext {
  readonly repoRoot: string;
  readonly gpuCount: number;
  /** The huggingface snapshot path for the rerank model (resolved by the caller — a Python call). */
  readonly rerankModelPath: string;
}

function embedArgv(config: EngineLaunchConfig, ctx: EngineArgvContext): string[] {
  return [
    "serve",
    config.embedModel,
    "--runner",
    "pooling",
    "--enforce-eager",
    "--hf_overrides",
    '{"is_matryoshka": true}',
    "--chat-template",
    `${ctx.repoRoot}/${EMBED_CHAT_TEMPLATE_REL}`,
    "--mm-processor-kwargs",
    `{"max_pixels": ${config.poolingMaxPixels}}`,
    "--host",
    LOOPBACK_HOST,
    "--port",
    String(config.ports.embed),
    "--gpu-memory-utilization",
    String(config.embedGpuUtil),
    "--max-model-len",
    String(config.embedMaxModelLen),
    "--trust-remote-code",
  ];
}

function rerankArgv(config: EngineLaunchConfig, ctx: EngineArgvContext): string[] {
  const multiGpu = ctx.gpuCount >= MULTI_GPU_THRESHOLD;
  const util = multiGpu ? config.rerankGpuUtilMulti : config.rerankGpuUtilSingle;
  return [
    "serve",
    ctx.rerankModelPath,
    "--served-model-name",
    config.rerankModel,
    "--runner",
    "pooling",
    "--enforce-eager",
    "--host",
    LOOPBACK_HOST,
    "--port",
    String(config.ports.rerank),
    "--gpu-memory-utilization",
    String(util),
    "--max-model-len",
    String(config.rerankMaxModelLen),
    "--trust-remote-code",
    "--hf_overrides",
    '{"architectures": ["Qwen3VLForSequenceClassification"],"classifier_from_token": ["no", "yes"],"is_original_qwen3_reranker": true}',
    "--chat-template",
    `${ctx.repoRoot}/${RERANK_CHAT_TEMPLATE_REL}`,
    "--mm-processor-kwargs",
    `{"max_pixels": ${config.poolingMaxPixels}}`,
  ];
}

/** The slash-free leaf alias vLLM registers as the PRIMARY served id (Claude Code can't resolve a "/", and
 *  a local-checkpoint path would otherwise be echoed as the model name). Works for both shapes: the last
 *  segment of `Qwen/Qwen3-VL-8B-Instruct` and of an absolute checkpoint path. */
function genModelAlias(genModel: string): string {
  return genModel.split("/").pop() ?? genModel;
}

/** The per-engine `--override-generation-config` payload (#23) — vLLM merges this over the model's shipped
 *  generation_config.json at serve time, so it applies to EVERY request regardless of the wire (the fix for
 *  the sampler-less agent-sdk /v1/messages path, which can't carry a per-request penalty). Keyed per engine
 *  so embed/rerank could gain their own overrides; only `gen` needs one today. temperature/top_p/top_k are
 *  the model-card recommended base — static card constants, not admin knobs — inlined here as the launch-time
 *  base a silent preset falls back to; an explicit per-request sampler value still overrides this base.
 *  `null` = no override flag emitted for that engine.
 *
 *  2026-08-10: retuned 0.7/0.8/20 → 1.0/0.95/20 with the THINKING-checkpoint swap. Those were Qwen's
 *  INSTRUCT-mode numbers; the card gives 1.0/0.95/20 for "thinking mode, general tasks" and 0.7/0.80/20 only
 *  for non-thinking. This matters because vLLM MERGES this payload over the checkpoint's shipped
 *  generation_config.json — the W8A8 checkpoint already carries 1.0/0.95/20, and the old values would have
 *  silently clobbered them back to instruct sampling on every request. */
function generationConfigOverrides(config: EngineLaunchConfig): Record<VllmEngine, Record<string, number> | null> {
  return {
    embed: null,
    rerank: null,
    gen: { temperature: 1.0, top_p: 0.95, top_k: 20, repetition_penalty: config.genRepetitionPenalty },
  };
}

/** Append `--override-generation-config '<json>'` for an engine when it has one, else nothing. Kept beside
 *  the map so every arm shares one emit shape (embed/rerank stay flag-free until they gain an override). */
function overrideGenerationConfigArgv(engine: VllmEngine, config: EngineLaunchConfig): string[] {
  const override = generationConfigOverrides(config)[engine];
  return override === null ? [] : ["--override-generation-config", JSON.stringify(override)];
}

function genArgv(config: EngineLaunchConfig, ctx: EngineArgvContext): string[] {
  const multiGpu = ctx.gpuCount >= MULTI_GPU_THRESHOLD;
  const tp = multiGpu ? MULTI_GPU_THRESHOLD : 1;
  const util = multiGpu ? config.genGpuUtilMulti : config.genGpuUtilSingle;
  return [
    "serve",
    config.genModel,
    // ALIAS FIRST, full id second. --served-model-name is presentation only — vLLM registers every value and
    // resolves a request against ANY of them, but the FIRST is the canonical id it echoes in /v1/models and
    // in response bodies. genModel became a filesystem PATH with the local-checkpoint swap (2026-08-10), and
    // path-first meant the catalog and every response advertised `/media/.../…-W8A8-Dynamic-Per-Token`.
    // The leaf alias is already slash-free, so it reads as a name; the full value stays registered so any
    // caller still sending it keeps resolving.
    "--served-model-name",
    genModelAlias(config.genModel),
    config.genModel,
    "--tensor-parallel-size",
    String(tp),
    "--host",
    LOOPBACK_HOST,
    "--port",
    String(config.ports.gen),
    "--gpu-memory-utilization",
    String(util),
    "--max-num-batched-tokens",
    "2096",
    "--max-num-seqs",
    "150",
    "--max-model-len",
    String(config.genMaxModelLen),
    // ── THINKING-CHECKPOINT SWAP PLAYBOOK — ACTIVATED 2026-08-10 (was dormant under Qwen3-VL-8B-INSTRUCT;
    //    memory [[agent-sdk-usage-cap-gotchas]] #7). The gen slot now runs a THINKING checkpoint
    //    (Qwen3.6-27B / `model_type: qwen3_5`, W8A8-int8), so items (a)-(c) below are LIVE flags, not notes.
    //
    //    (a) `--reasoning-parser qwen3` — routes reasoning into a SEPARATE response field. This is the real
    //        mechanism; it SUPERSEDES the THINK_BLOCK_RE strip, which is now the fallback.
    "--reasoning-parser",
    "qwen3",
    "--chat-template",
    `${ctx.repoRoot}/${GEN_CHAT_TEMPLATE_REL}`,
    "--default-chat-template-kwargs",
    '{"enable_thinking": false, "preserve_thinking": true}',
    //    (b) enable_in_reasoning — vLLM 0.26 defaults it FALSE (verified against StructuredOutputsConfig).
    //        Left false, xgrammar SKIPS constraining whenever reasoning is present and the whole
    //        extraction/tool layer (json_schema + tool_choice) dies INVISIBLY — valid-looking prose, zero
    //        enforcement. MANDATORY on a thinking checkpoint; the rpg extraction path depends on it.
    "--structured-outputs-config",
    JSON.stringify({ enable_in_reasoning: true }),
    //    (c) tool parser: `hermes` was correct for Qwen3-VL and is WRONG here. This checkpoint's
    //        chat_template.jinja emits `<tool_call><function=NAME><parameter=NAME>` — the qwen3_coder shape
    //        (Qwen's own card specifies it). In 0.26 `qwen3_coder` and `qwen3_xml` resolve to the SAME class
    //        (Qwen3EngineToolParser), so the spelling is cosmetic; the change off `hermes` is not.
    "--enable-auto-tool-choice",
    "--tool-call-parser",
    "qwen3_coder",
    //    (d)-(f) remain OPTIONAL and unemitted: `--reasoning-config` + per-request `thinking_token_budget`
    //    (runaway guard), `--default-chat-template-kwargs enable_thinking:false` + per-request
    //    `reasoning_effort` (buy thinking per call), and `include_reasoning:false` on the wire (don't ship
    //    the scratchpad downstream). Add them per call-class when the traffic shape justifies it.
    //
    // Throughput profile from the vLLM Qwen3.5/3.6 recipe: prefix caching ON, vision encoder data-parallel
    // across TP ranks (full encoder per rank — +0.46GB/card here, measured), and the preprocessed-input
    // cache in shared memory rather than mirrored per process (it defaults to 4GiB PER process).
    "--enable-prefix-caching",
    "--mm-encoder-tp-mode",
    "data",
    "--mm-processor-cache-type",
    "shm",
    "--mm-processor-kwargs",
    `{"max_pixels": ${config.genMaxPixels}}`,
    ...overrideGenerationConfigArgv("gen", config),
  ];
}

const ARGV_BUILDERS: Record<VllmEngine, (config: EngineLaunchConfig, ctx: EngineArgvContext) => string[]> = {
  embed: embedArgv,
  rerank: rerankArgv,
  gen: genArgv,
};

// The endpoints whose per-request access log we SILENCE — the supervisor /health probe + the auto-sleep
// /metrics poller hit these every tick and would otherwise flood the engine log. Hygiene constant (no knob).
const SILENCED_ACCESS_LOG_ENDPOINTS = "/health,/metrics,/ping";
// The engine-side debug flight recorder's log-body cap (VLLM_DEBUG_REQUESTS on).
const DEBUG_MAX_LOG_LEN = "2048";

/** The flags appended to EVERY engine (embed/rerank/gen), after each arm's own flags:
 *   • always-on hygiene: silence the probe/poller access-log spam; request-id headers (correlate a wire
 *     capture to the engine's own log line); force-include usage (unconditional streamed token accounting).
 *   • `--enable-sleep-mode` when sleepMode (B.3 — cumem allocator so /sleep frees VRAM; endpoints register
 *     only with VLLM_SERVER_DEV_MODE=1 on the child).
 *   • `--enable-log-requests --enable-log-outputs --max-log-len` when debugRequests (the engine-side flight
 *     recorder: what the engine PARSED, post-chat-template/tool-parser — the wire-capture blind spot).
 *   • `--shutdown-timeout N` when a positive graceful-drain window is configured. */
function commonSuffixArgv(config: EngineLaunchConfig): string[] {
  return [
    "--disable-access-log-for-endpoints",
    SILENCED_ACCESS_LOG_ENDPOINTS,
    "--enable-request-id-headers",
    "--enable-force-include-usage",
    ...(config.sleepMode ? ["--enable-sleep-mode"] : []),
    ...(config.debugRequests ? ["--enable-log-requests", "--enable-log-outputs", "--max-log-len", DEBUG_MAX_LOG_LEN] : []),
    ...(config.shutdownTimeoutS > 0 ? ["--shutdown-timeout", String(config.shutdownTimeoutS)] : []),
  ];
}

/** Build the `vllm serve …` argv (WITHOUT the leading binary) for one engine. Pure: `(engine, config, ctx)`
 *  → argv. The caller prepends the vllm binary + owns CUDA_VISIBLE_DEVICES, backgrounding, and logging. */
export function buildEngineArgv(engine: VllmEngine, config: EngineLaunchConfig, ctx: EngineArgvContext): string[] {
  return [...ARGV_BUILDERS[engine](config, ctx), ...commonSuffixArgv(config)];
}

/** The GPU pinning per engine: embed on GPU0, rerank on GPU1 (multi-GPU), gen spans all via TP. (rerank
 *  moved BACK to GPU1 2026-08-13 with the 27B swap — one pooling tenant per card beside gen's halves; this
 *  reverses the 08-10 GPU0 consolidation, which fit the 8B era's headroom math, not the 27B's.) Single-GPU
 *  packs everything on GPU0 — the swap's first cut returned "1" UNCONDITIONALLY, which on a 1-card box pins
 *  rerank to a nonexistent device (caught by the topology test 2026-08-13). TWO-HOME LAW: the wake-budget's
 *  `engineVramNeed` mirrors this pinning — change BOTH ([[vllm-concurrency-topology-tuning]]). Returned as
 *  the CUDA_VISIBLE_DEVICES value the caller exports; gen omits it (TP claims all visible cards). */
export function engineCudaVisibleDevices(engine: VllmEngine, gpuCount: number): string | null {
  switch (engine) {
    case "embed":
      return "0";
    case "rerank":
      return gpuCount >= 2 ? "1" : "0";
    case "gen":
      return null;
  }
}
