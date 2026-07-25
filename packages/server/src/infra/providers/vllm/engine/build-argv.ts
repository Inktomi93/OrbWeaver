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

import type { VLLM_ENGINES } from "./engines";

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
}

/** Resolve the launch config: `admin override ?? env floor` per field (the layer.ts precedent). Ports stay
 *  env-only (DEPLOYMENT facts — displayed, never admin-edited). Pure. */
export function resolveEngineLaunchConfig(floor: EngineLaunchEnvFloor, override?: EngineLaunchOverride | null): EngineLaunchConfig {
  const o = override ?? {};
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
 *  so embed/rerank could gain their own overrides; only `gen` needs one today (Qwen3-VL's repetition_penalty
 *  1.0 → output-cap loop). `null` = no override flag emitted for that engine. */
function generationConfigOverrides(config: EngineLaunchConfig): Record<VllmEngine, Record<string, number> | null> {
  return {
    embed: null,
    rerank: null,
    gen: { repetition_penalty: config.genRepetitionPenalty },
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

/** Build the `vllm serve …` argv (WITHOUT the leading binary) for one engine. Pure: `(engine, config, ctx)`
 *  → argv. The caller prepends the vllm binary + owns CUDA_VISIBLE_DEVICES, backgrounding, and logging. */
export function buildEngineArgv(engine: VllmEngine, config: EngineLaunchConfig, ctx: EngineArgvContext): string[] {
  return ARGV_BUILDERS[engine](config, ctx);
}

/** The GPU pinning per engine: embed on GPU0; rerank on GPU1 (multi-GPU) else GPU0; gen spans both via TP.
 *  Returned as the CUDA_VISIBLE_DEVICES value the caller exports. gen omits it (TP claims all visible cards). */
export function engineCudaVisibleDevices(engine: VllmEngine, gpuCount: number): string | null {
  const multiGpu = gpuCount >= MULTI_GPU_THRESHOLD;
  switch (engine) {
    case "embed":
      return "0";
    case "rerank":
      return multiGpu ? "1" : "0";
    case "gen":
      return null;
  }
}
