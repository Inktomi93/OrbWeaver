// Local multi-role engine (its own subsystem, not a chat-backend peer). `createVllmBackend(deps)` returns
// a sealed {@link ProviderBackend} whose five INDEPENDENT surfaces (chat/embed/rerank/imageEmbed/
// summarize) run against ONE engine, plus the engine lifecycle handle `entry/` wires at boot. `now` is
// injected (no-raw-clock); CONCURRENCY defaults are NOT env keys (settings-tier knob, providers.md §7.2).

import process from "node:process";
import type { ResolvedEngineLaunch } from "@orb/contracts/settings";
import { engineDeploymentEnv, engineLaunchEnvFloor, env } from "#foundation/env";
import type { ChatRequest, ChatResult, ProviderBackend, VllmChatRequest, WireCaptureSink } from "../contract/index.ts";
import { ProviderError } from "../contract/index.ts";
import type { EngineDeploymentEnv, EngineDeploymentFacts, EngineStatusRecord, VLLM_ENGINES, VllmEngineClient } from "./engine/index.ts";
import {
  allEngineStatuses,
  createVllmEngineClient,
  fleetRunDir,
  getVllmEngineController,
  isHeld,
  isStopped,
  resolveEngineDeploymentFacts,
  startVllmEngines,
} from "./engine/index.ts";
// Surfaces are imported PER FILE (no surfaces/ barrel — `vllm-surface-isolation` gate forbids one);
// this root file is not under surfaces/, so aggregating here is the legal seam.
import { createVllmChat } from "./surfaces/chat.ts";
import { createVllmEmbed } from "./surfaces/embed.ts";
import { createVllmImageEmbed } from "./surfaces/image-embed.ts";
import { createVllmRerank } from "./surfaces/rerank.ts";
import { createVllmStructured, createVllmSummarize } from "./surfaces/summarize.ts";

// Boot GPU-presence probe — re-exported for entry; the supervisor reads the same home (one `nvidia-smi`
// probe in the codebase). resolveEngineDeploymentFacts is re-exported for the admin-panel wiring seam.
export type { EngineCapacityMetrics, EngineDeploymentFacts, EngineStatusRecord } from "./engine/index.ts";
export {
  detectGpu,
  fetchEngineCapacity,
  fetchEngineMaxModelLen,
  fleetCapacitySnapshot,
  resolveEngineDeploymentFacts,
  VLLM_ENGINES,
} from "./engine/index.ts";
export { createVllmChat } from "./surfaces/chat.ts";
export { createVllmEmbed } from "./surfaces/embed.ts";
export { createVllmImageEmbed } from "./surfaces/image-embed.ts";
export { createVllmRerank } from "./surfaces/rerank.ts";
export { createVllmStructured, createVllmSummarize } from "./surfaces/summarize.ts";

type VllmEngine = (typeof VLLM_ENGINES)[number];

// Fallback concurrency when compose doesn't inject the effective-config floor (tests / GPU-less). These
// MIRROR the layer.ts born-in-DB floors (embed 4, summarize 8) — keep them in sync (a drift here is the
// two-home bug). Compose always injects the real resolved values; these only apply when it doesn't.
const DEFAULT_EMBED_CONCURRENCY = 4;
const DEFAULT_SUMMARIZE_CONCURRENCY = 8;

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
  /** Cwd marker the supervisor's orphan-reap + the detached-spawn trigger use; defaults to cwd. */
  readonly repoRoot?: string | undefined;
  /** The fleet MANAGER posture (adopt-or-start) triggers the detached spawner + owns auto-sleep; adopt-only
   *  adopts healthy engines but NEVER spawns (fail-fast on a down engine). Omitted ⇒ true (manager default). */
  readonly manages?: boolean | undefined;
  /** Live getter for the RESOLVED engine launch config (admin override ⊕ env floor). RESERVED: under the
   *  ownership inversion the detached front-door verb rebuilds argv from the env floor, so this is not
   *  currently threaded into the auto-spawn path (an admin retune-restart rides engine-control.ts). */
  readonly engineLaunch?: (() => ResolvedEngineLaunch) | undefined;
  /** Live getter for the per-REQUEST presence-penalty default the chat surface applies when a preset is silent
   *  (item 7 — engineLaunch.genPresencePenalty). Read per request so an admin retune applies without a restart.
   *  Omitted (tests) ⇒ the surface's card-default fallback (byte-identical to the former CARD_DEFAULT). */
  readonly genPresencePenalty?: (() => number) | undefined;
  /** Live getter for the per-REQUEST repetition-penalty default the chat surface applies when a preset is
   *  silent (engineLaunch.genRepetitionPenalty). Read per request so an admin retune applies without a
   *  restart — this value was a `--override-generation-config` LAUNCH flag until 2026-08-14 (the flag existed
   *  only for the retired sampler-less agent-sdk /v1/messages wire, and it outranked the checkpoint's own
   *  generation_config.json on every request). Omitted (tests) ⇒ the surface's 1.0 no-op fallback. */
  readonly genRepetitionPenalty?: (() => number) | undefined;
  /** TASK-24 wire-capture sink — compose injects it only when capture is enabled; absent ⇒ the chat surface
   *  never records (zero cost). Captures the LITERAL openai-compat /v1/chat/completions body it POSTs. */
  readonly captureWire?: WireCaptureSink | undefined;
}

/** THE api narrowing seam (2026-08-14 — DISPATCH-REGRESSION BELT, NOT A LIVE PATH: do not report the throw
 *  below as dead code, and do not "simplify" it away). {@link ProviderBackend.runChatTurn} is typed over the
 *  WHOLE {@link ChatRequest}
 *  union (one contract for every backend), while the vLLM chat surface takes only the history-wire arm
 *  ({@link VllmChatRequest}) — so the conversion happens exactly here, once, at the composition boundary and not
 *  inside the surface. The `agent-sdk` arm is already fail-closed one layer up (`roles/dispatch.ts`
 *  `deriveRunner` throws on agent-sdk×vllm — the loopback skin was retired 2026-07-27), so this throw is a
 *  belt for a future dispatch regression, never a path a request reaches today. EXPORTED because any caller
 *  that binds the raw chat surface into a whole-union `runChatTurn` slot (the wire-capture + rpg integration
 *  harnesses do exactly what compose does) must cross the SAME seam — a second hand-rolled narrowing, or a
 *  cast, would be a second answer to "which arms does vLLM serve?". */
export function toVllmChatRequest(req: ChatRequest): VllmChatRequest {
  if (req.api === "agent-sdk") {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `vllm chat surface does not serve the "${req.api}" api`,
    });
  }
  return req;
}

/** Builds the vLLM subsystem: the five surfaces bound to one engine + the lifecycle handle. */
export function createVllmBackend(deps: VllmBackendDeps): VllmBackend {
  const client = deps.client ?? createVllmEngineClient();
  const embedDim = deps.embedDim ?? env.VLLM_EMBED_DIM;
  const chunkSize = deps.chunkSize ?? env.VLLM_EMBED_CHUNK_SIZE;
  const embedConcurrency = deps.concurrency?.embed ?? DEFAULT_EMBED_CONCURRENCY;
  const summarizeConcurrency = deps.concurrency?.summarize ?? DEFAULT_SUMMARIZE_CONCURRENCY;
  const repoRoot = deps.repoRoot ?? process.cwd();

  // DEPLOYMENT facts for the admin panel (port + store path). Under ownership inversion the supervisor no
  // longer builds a spawn spec — the detached front-door verb (engines.sh start) rebuilds argv from the env
  // floor — so `deps.engineLaunch` (the admin AppSettings launch override) is NOT threaded into the auto-spawn
  // path today; an admin retune-restart rides engine-control.ts (which re-triggers the detached verb, reading
  // the current env floor). This is a known limitation of the inversion (flagged in the report).
  const floor = engineLaunchEnvFloor();
  const deployment: EngineDeploymentEnv = engineDeploymentEnv();
  const ports = { embed: floor.VLLM_EMBED_PORT, rerank: floor.VLLM_RERANK_PORT, gen: floor.VLLM_GEN_PORT };

  const engine: VllmEngineHandle = {
    start: () =>
      startVllmEngines({
        repoRoot,
        now: deps.now,
        // Only the MANAGER posture (adopt-or-start) spawns; adopt-only adopts + fails fast. Defaults true
        // (today's manager behavior) when compose doesn't inject a posture.
        ...(deps.manages !== undefined ? { manages: deps.manages } : {}),
        // The supervisor tick reads the hold marker each tick → sleeping-held classification.
        sleepHeld: () => isHeld(fleetRunDir(repoRoot)),
        // The supervisor tick reads the stopped marker each tick — present ⇒ refuse the takeover-respawn
        // (#1929: `engines stop` alone left the pidfile behind, which read as a crash).
        stoppedHeld: () => isStopped(fleetRunDir(repoRoot)),
      }),
    status: () => allEngineStatuses(),
    deployment: () => resolveEngineDeploymentFacts({ repoRoot, deployment, ports }),
    restart: (e) => {
      const controller = getVllmEngineController();
      return controller === null ? Promise.resolve("vllm supervisor not running") : controller.restart(e);
    },
  };

  const chat = createVllmChat({
    client,
    now: deps.now,
    ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
    ...(deps.genPresencePenalty !== undefined ? { genPresencePenalty: deps.genPresencePenalty } : {}),
    ...(deps.genRepetitionPenalty !== undefined ? { genRepetitionPenalty: deps.genRepetitionPenalty } : {}),
  });

  return {
    key: "vllm",
    // `async` so the SYNCHRONOUS narrowing guard surfaces as a rejected promise, never a thrown-before-await
    // (the contract's role methods are awaitable — the custom-byo `inspect` precedent; the surface's own
    // guard used to be inside an async body and every caller expects a rejection).
    runChatTurn: async (req: ChatRequest): Promise<ChatResult> => await chat(toVllmChatRequest(req)),
    embed: createVllmEmbed({
      client,
      embedDim,
      chunkSize,
      concurrency: embedConcurrency,
      requestTimeoutMs: env.VLLM_EMBED_REQUEST_TIMEOUT_MS,
      // The per-POST token ceiling the item-count `chunkSize` cannot express (#187) — one home, the env floor.
      maxBatchTokens: env.VLLM_EMBED_MAX_BATCH_TOKENS,
      // The window the embed engine is LAUNCHED with (`--max-model-len`) — one home, so the client-side
      // clamp (#165) can never drift from what the engine will accept.
      maxInputTokens: env.VLLM_EMBED_MAX_MODEL_LEN,
    }),
    // Same single-home discipline as embed above: the window the RERANK engine is launched with (#173).
    rerank: createVllmRerank({ client, maxInputTokens: env.VLLM_RERANK_MAX_MODEL_LEN }),
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
