// Local multi-role engine (its own subsystem, not a chat-backend peer). `createVllmBackend(deps)` returns
// a sealed {@link ProviderBackend} whose five INDEPENDENT surfaces (chat/embed/rerank/imageEmbed/
// summarize) run against ONE engine, plus the engine lifecycle handle `entry/` wires at boot. `now` is
// injected (no-raw-clock); CONCURRENCY defaults are NOT env keys (settings-tier knob, providers.md §7.2).

import process from "node:process";
import type { ResolvedEngineLaunch } from "@orb/contracts/settings";
import { engineDeploymentEnv, engineLaunchEnvFloor, env, processEnvSnapshot } from "#foundation/env";
import type { ProviderBackend, WireCaptureSink } from "../contract";
import type { EngineDeploymentEnv, EngineDeploymentFacts, EngineSpawnSpec, EngineStatusRecord, VLLM_ENGINES, VllmEngineClient } from "./engine";
import {
  allEngineStatuses,
  buildEngineSpawnSpec,
  countGpus,
  createVllmEngineClient,
  getVllmEngineController,
  resolveEngineDeploymentFacts,
  startVllmEngines,
} from "./engine";
// Surfaces are imported PER FILE (no surfaces/ barrel — `vllm-surface-isolation` gate forbids one);
// this root file is not under surfaces/, so aggregating here is the legal seam.
import { createVllmChat } from "./surfaces/chat";
import { createVllmEmbed } from "./surfaces/embed";
import { createVllmImageEmbed } from "./surfaces/image-embed";
import { createVllmRerank } from "./surfaces/rerank";
import { createVllmStructured, createVllmSummarize } from "./surfaces/summarize";

// Boot GPU-presence probe — re-exported for entry; the supervisor reads the same home (one `nvidia-smi`
// probe in the codebase). resolveEngineDeploymentFacts is re-exported for the admin-panel wiring seam.
export type { EngineDeploymentFacts } from "./engine";
export { detectGpu, fetchEngineMaxModelLen, fetchGenMaxModelLen, resolveEngineDeploymentFacts } from "./engine";
export { createVllmChat } from "./surfaces/chat";
export { createVllmEmbed } from "./surfaces/embed";
export { createVllmImageEmbed } from "./surfaces/image-embed";
export { createVllmRerank } from "./surfaces/rerank";
export { createVllmStructured, createVllmSummarize } from "./surfaces/summarize";

type VllmEngine = (typeof VLLM_ENGINES)[number];

// Fallback concurrency when compose doesn't inject the effective-config floor (tests / GPU-less). These
// MIRROR the layer.ts born-in-DB floors (embed 4, summarize 32) — the old `4`/`4` drifted from the summarize
// floor of 32. Compose always injects the real resolved values; these only apply when it doesn't.
const DEFAULT_EMBED_CONCURRENCY = 4;
const DEFAULT_SUMMARIZE_CONCURRENCY = 32;

/** Engine lifecycle handle `entry/` + the admin panel wire; separate from the role surface (surfaces
 *  EXECUTE, this OWNS the supervised processes). */
export interface VllmEngineHandle {
  readonly start: () => () => void;
  readonly status: () => Record<string, EngineStatusRecord>;
  /** The env-only DEPLOYMENT facts (port + store path) shown read-only beside each engine's status in the
   *  admin panel — resolved from the SAME env projections the spawn spec reads, so they can't drift. */
  readonly deployment: () => Record<VllmEngine, EngineDeploymentFacts>;
  /** Manual admin restart; resolves with a status line, no-op message when supervisor isn't running. */
  readonly restart: (engine: VllmEngine) => Promise<string>;
}

/** The vLLM subsystem return: the sealed backend plus its engine lifecycle handle. */
export interface VllmBackend extends ProviderBackend {
  readonly key: "vllm";
  readonly engine: VllmEngineHandle;
}

/** Deps the composition root injects. All optional but `now`. */
export interface VllmBackendDeps {
  readonly now: () => number;
  readonly client?: VllmEngineClient | undefined;
  readonly embedDim?: number | undefined;
  readonly chunkSize?: number | undefined;
  readonly concurrency?: { readonly embed?: number; readonly summarize?: number } | undefined;
  /** Cwd marker the supervisor's death-couple + orphan-reap use; defaults to cwd. */
  readonly repoRoot?: string | undefined;
  /** Live getter for the RESOLVED engine launch config (admin override ⊕ env floor). Read PER SPAWN so an
   *  admin retune + restart picks up the new flags. Omitted (tests / GPU-less) ⇒ the pure env-floor default. */
  readonly engineLaunch?: (() => ResolvedEngineLaunch) | undefined;
  /** Live getter for the per-REQUEST presence-penalty default the chat surface applies when a preset is silent
   *  (item 7 — engineLaunch.genPresencePenalty). Read per request so an admin retune applies without a restart.
   *  Omitted (tests) ⇒ the surface's card-default fallback (byte-identical to the former CARD_DEFAULT). */
  readonly genPresencePenalty?: (() => number) | undefined;
  /** TASK-24 wire-capture sink — compose injects it only when capture is enabled; absent ⇒ the chat surface
   *  never records (zero cost). Captures the LITERAL openai-compat /v1/chat/completions body it POSTs. */
  readonly captureWire?: WireCaptureSink | undefined;
}

/** Builds the vLLM subsystem: the five surfaces bound to one engine + the lifecycle handle. */
export function createVllmBackend(deps: VllmBackendDeps): VllmBackend {
  const client = deps.client ?? createVllmEngineClient();
  const embedDim = deps.embedDim ?? env.VLLM_EMBED_DIM;
  const chunkSize = deps.chunkSize ?? env.VLLM_EMBED_CHUNK_SIZE;
  const embedConcurrency = deps.concurrency?.embed ?? DEFAULT_EMBED_CONCURRENCY;
  const summarizeConcurrency = deps.concurrency?.summarize ?? DEFAULT_SUMMARIZE_CONCURRENCY;
  const repoRoot = deps.repoRoot ?? process.cwd();

  // The spawn-spec builder handed to the supervisor: resolve the launch config (admin override ⊕ env floor)
  // + deployment env + detected GPU count into a command+args+env, PER SPAWN so a restart-to-apply picks up
  // an admin retune. The floor's ports are DEPLOYMENT facts (env-only); the launch flags come from the live
  // effective config when injected, else the pure env floor. gpuCount drives TP + the util split.
  const floor = engineLaunchEnvFloor();
  const deployment: EngineDeploymentEnv = engineDeploymentEnv();
  const ports = { embed: floor.VLLM_EMBED_PORT, rerank: floor.VLLM_RERANK_PORT, gen: floor.VLLM_GEN_PORT };
  const spawnSpec = (e: VllmEngine): EngineSpawnSpec => {
    const launch = deps.engineLaunch?.() ?? {
      embedModel: floor.VLLM_EMBED_MODEL,
      rerankModel: floor.VLLM_RERANK_MODEL,
      genModel: floor.VLLM_GEN_MODEL,
      embedMaxModelLen: floor.VLLM_EMBED_MAX_MODEL_LEN,
      rerankMaxModelLen: floor.VLLM_RERANK_MAX_MODEL_LEN,
      genMaxModelLen: floor.VLLM_GEN_MAX_MODEL_LEN,
      embedGpuUtil: floor.VLLM_EMBED_GPU_UTIL,
      rerankGpuUtilMulti: floor.VLLM_RERANK_GPU_UTIL_MULTI,
      rerankGpuUtilSingle: floor.VLLM_RERANK_GPU_UTIL_SINGLE,
      genGpuUtilMulti: floor.VLLM_GEN_GPU_UTIL_MULTI,
      genGpuUtilSingle: floor.VLLM_GEN_GPU_UTIL_SINGLE,
      poolingMaxPixels: floor.VLLM_POOLING_MAX_PIXELS,
      genMaxPixels: floor.VLLM_GEN_MAX_PIXELS,
      genRepetitionPenalty: floor.VLLM_GEN_REPETITION_PENALTY,
    };
    return buildEngineSpawnSpec(e, { ...launch, ports }, { repoRoot, gpuCount: countGpus(), deployment, baseEnv: processEnvSnapshot() });
  };

  const engine: VllmEngineHandle = {
    start: () => startVllmEngines({ repoRoot, now: deps.now, spawnSpec }),
    status: () => allEngineStatuses(),
    deployment: () => resolveEngineDeploymentFacts({ repoRoot, deployment, ports }),
    restart: (e) => {
      const controller = getVllmEngineController();
      return controller === null ? Promise.resolve("vllm supervisor not running") : controller.restart(e);
    },
  };

  return {
    key: "vllm",
    runChatTurn: createVllmChat({
      client,
      now: deps.now,
      ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
      ...(deps.genPresencePenalty !== undefined ? { genPresencePenalty: deps.genPresencePenalty } : {}),
    }),
    embed: createVllmEmbed({ client, embedDim, chunkSize, concurrency: embedConcurrency, requestTimeoutMs: env.VLLM_EMBED_REQUEST_TIMEOUT_MS }),
    rerank: createVllmRerank({ client }),
    imageEmbed: createVllmImageEmbed({ client, embedDim, concurrency: embedConcurrency }),
    summarize: createVllmSummarize({
      client,
      concurrency: summarizeConcurrency,
      now: deps.now,
      ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
    }),
    // The structured-output primitive — same engine core + concurrency; `response_format` rides guided decoding.
    structured: createVllmStructured({
      client,
      concurrency: summarizeConcurrency,
      now: deps.now,
      ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
    }),
    engine,
  };
}
