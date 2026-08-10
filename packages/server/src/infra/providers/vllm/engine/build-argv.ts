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
//           --tool-call-parser hermes for the buddy agent's /v1/messages tool loop; --served-model-name
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

/** The slash-free leaf alias vLLM registers alongside the full id (Claude Code can't resolve a "/"). */
function genModelAlias(genModel: string): string {
  return genModel.split("/").pop() ?? genModel;
}

/** The per-engine `--override-generation-config` payload (#23) — vLLM merges this over the model's shipped
 *  generation_config.json at serve time, so it applies to EVERY request regardless of the wire (the fix for
 *  the sampler-less agent-sdk /v1/messages path, which can't carry a per-request penalty). Keyed per engine
 *  so embed/rerank could gain their own overrides; only `gen` needs one today. temperature/top_p/top_k are
 *  the Qwen3-VL-8B-Instruct model-card recommended VL base (0.7/0.8/20) — static card constants, not admin
 *  knobs — inlined here as the launch-time base a silent preset falls back to; an explicit per-request
 *  sampler value still overrides this base. `null` = no override flag emitted for that engine. */
function generationConfigOverrides(config: EngineLaunchConfig): Record<VllmEngine, Record<string, number> | null> {
  return {
    embed: null,
    rerank: null,
    gen: { temperature: 0.7, top_p: 0.8, top_k: 20, repetition_penalty: config.genRepetitionPenalty },
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
    "--served-model-name",
    config.genModel,
    genModelAlias(config.genModel),
    "--tensor-parallel-size",
    String(tp),
    "--host",
    LOOPBACK_HOST,
    "--port",
    String(config.ports.gen),
    "--gpu-memory-utilization",
    String(util),
    "--max-model-len",
    String(config.genMaxModelLen),
    // Qwen3-VL-8B-Instruct is bf16-native; the deployment guide recommends explicit --dtype bfloat16 to
    // guard against vLLM's --dtype auto ever resolving to an fp16 fallback (numerical garbage on this model).
    "--dtype",
    "bfloat16",
    // ── THINKING-CHECKPOINT SWAP PLAYBOOK (dormant on this Qwen3-VL-8B-INSTRUCT; the WHOLE recipe for a
    //    route-2 swap, one home — memory [[agent-sdk-usage-cap-gotchas]] #7). Our model is Qwen3-VL and
    //    `hermes` below is CORRECT + live-proven; the notes fire only on a swap to a Thinking/other checkpoint.
    //    A Qwen3-VL-THINKING (likely route-2) swap requires ALL of:
    //    (a) `--reasoning-parser qwen3` — routes reasoning into a SEPARATE field (this is the real mechanism;
    //        it SUPERSEDES the THINK_BLOCK_RE strip, which becomes a fallback).
    //    (b) `--structured-outputs-config.enable_in_reasoning=True` — else xgrammar SKIPS constraining whenever
    //        reasoning is present, and the whole extraction/tool layer (json_schema + tool_choice) dies INVISIBLY
    //        (valid-looking prose, zero enforcement). MANDATORY on any thinking checkpoint.
    //    (c) tool-parser re-check: `hermes` holds for Qwen3-VL (current); a Qwen3-CODER variant needs
    //        `--tool-call-parser qwen3_xml` instead — conditional future landmine, NOT current.
    //    (d) optional `--reasoning-config` + a per-request `thinking_token_budget` — the runaway guard; may
    //        differ per call class (generous for extraction, tight for prose).
    //    (e) `--default-chat-template-kwargs enable_thinking:false` + per-request enable via `reasoning_effort`
    //        — ONE engine, thinking bought selectively per call rather than always-on.
    //    (f) `include_reasoning:false` on the wire — reasoning-field hygiene (don't ship the scratchpad).
    "--enable-auto-tool-choice",
    "--tool-call-parser",
    "hermes",
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

/** The GPU pinning per engine: embed + rerank BOTH on GPU0; gen spans both via TP. (rerank moved off GPU1 onto
 *  GPU0 with embed 2026-08-10 — owner: consolidate the two small pooling models on one card so gen's TP halves
 *  get more util headroom. The wake-budget's `engineVramNeed` pins rerank to GPU0 too — kept in sync.) Returned
 *  as the CUDA_VISIBLE_DEVICES value the caller exports; gen omits it (TP claims all visible cards). */
export function engineCudaVisibleDevices(engine: VllmEngine, _gpuCount: number): string | null {
  switch (engine) {
    case "embed":
      return "0";
    case "rerank":
      return "0";
    case "gen":
      return null;
  }
}
