// infra/providers/vllm — THE LOCAL MULTI-ROLE ENGINE (its own subsystem, NOT a chat-backend peer).
//
// `createVllmBackend(deps)` returns a sealed {@link ProviderBackend} whose role methods are the five
// INDEPENDENT surfaces (chat / embed / rerank / imageEmbed / summarize) registered against ONE engine —
// the remote backends serve only `chat`; vLLM serves five, which is WHY it is its own engine. The return
// ALSO carries the engine lifecycle handle (start/stop/status/restart) that `entry/` wires at boot and the
// admin panel reaches for a manual bounce. `entry/` registers the returned backend in the BackendRegistry
// under the "vllm" key.
//
// DETERMINISM: `now` is injected (the chat surface's turn timing + the supervisor's breaker clock — the
// `no-raw-clock` seam). The engine `client` defaults to the real env-backed loopback client; tests inject
// a fake. The embed knobs default from `foundation/env`; CONCURRENCY is injected with a constant default —
// it is NOT a `VLLM_*` env key (see the subsystem FLAG: it belongs in the settings tier, providers.md §7.2).

import process from "node:process";
import { env } from "#foundation/env";
import type { ProviderBackend } from "../contract";
import type { EngineStatusRecord, VLLM_ENGINES, VllmEngineClient } from "./engine";
import {
  allEngineStatuses,
  createVllmEngineClient,
  getVllmEngineController,
  startVllmEngines,
} from "./engine";
// Surfaces are imported PER FILE (there is no surfaces/ barrel): the `vllm-surface-isolation` gate flags
// any `surfaces/*.ts` importing another `surfaces/*.ts`, and a barrel is exactly that. This root file is
// NOT under surfaces/, so aggregating the five here is the legal seam. Re-exported below for the tests.
import { createVllmChat } from "./surfaces/chat";
import { createVllmEmbed } from "./surfaces/embed";
import { createVllmImageEmbed } from "./surfaces/image-embed";
import { createVllmRerank } from "./surfaces/rerank";
import { createVllmSummarize } from "./surfaces/summarize";

export { createVllmChat } from "./surfaces/chat";
export { createVllmEmbed } from "./surfaces/embed";
export { createVllmImageEmbed } from "./surfaces/image-embed";
export { createVllmRerank } from "./surfaces/rerank";
export { createVllmSummarize } from "./surfaces/summarize";

type VllmEngine = (typeof VLLM_ENGINES)[number];

// Default in-flight request fan-out per batch role — enough to keep vLLM's continuous batcher fed without
// a corpus backfill starving interactive query embeds. A settings-tier knob in time (see header FLAG).
const DEFAULT_EMBED_CONCURRENCY = 4;
const DEFAULT_SUMMARIZE_CONCURRENCY = 4;

/** The engine lifecycle handle `entry/` + the admin panel wire. Separate from the role surface: the
 *  surfaces EXECUTE; this OWNS the supervised processes. */
export interface VllmEngineHandle {
  /** Start the supervisor (adopt/spawn/death-couple/breaker/monitor); returns the graceful-drain closer.
   *  No-op-safe to call once at boot — `entry/` keeps the returned stop fn. */
  readonly start: () => () => void;
  /** Snapshot every engine's lifecycle status (the `/api/healthz` + admin-panel read). */
  readonly status: () => Record<string, EngineStatusRecord>;
  /** Manual admin restart of one engine — resolves with a status line; a no-op message when the
   *  supervisor isn't running (no GPU / not started / drained). */
  readonly restart: (engine: VllmEngine) => Promise<string>;
}

/** The vLLM subsystem return: the sealed backend PLUS its engine lifecycle handle. An infra DI surface
 *  (`export interface`, like the sibling backends' deps) — it is NOT a cross-boundary contract type. */
export interface VllmBackend extends ProviderBackend {
  readonly key: "vllm";
  readonly engine: VllmEngineHandle;
}

/** Deps the composition root injects. All optional but `now` — the root owns the clock. */
export interface VllmBackendDeps {
  readonly now: () => number;
  /** The loopback engine client; defaults to the real env-backed one. Tests inject a fake. */
  readonly client?: VllmEngineClient | undefined;
  /** Output dim for the unified embed space; defaults to `VLLM_EMBED_DIM`. */
  readonly embedDim?: number | undefined;
  /** Texts per /v1/embeddings request; defaults to `VLLM_EMBED_CHUNK_SIZE`. */
  readonly chunkSize?: number | undefined;
  /** In-flight request fan-out per batch role (settings-tier knob; NOT env). */
  readonly concurrency?: { readonly embed?: number; readonly summarize?: number } | undefined;
  /** Repo root — the cwd marker the supervisor's death-couple + orphan-reap use; defaults to cwd. */
  readonly repoRoot?: string | undefined;
}

/** Build the vLLM subsystem: the five surfaces bound to one engine + the lifecycle handle. */
export function createVllmBackend(deps: VllmBackendDeps): VllmBackend {
  const client = deps.client ?? createVllmEngineClient();
  const embedDim = deps.embedDim ?? env.VLLM_EMBED_DIM;
  const chunkSize = deps.chunkSize ?? env.VLLM_EMBED_CHUNK_SIZE;
  const embedConcurrency = deps.concurrency?.embed ?? DEFAULT_EMBED_CONCURRENCY;
  const summarizeConcurrency = deps.concurrency?.summarize ?? DEFAULT_SUMMARIZE_CONCURRENCY;
  const repoRoot = deps.repoRoot ?? process.cwd();

  const engine: VllmEngineHandle = {
    start: () => startVllmEngines({ repoRoot, now: deps.now }),
    status: () => allEngineStatuses(),
    restart: (e) => {
      const controller = getVllmEngineController();
      return controller === null
        ? Promise.resolve("vllm supervisor not running")
        : controller.restart(e);
    },
  };

  return {
    key: "vllm",
    runChatTurn: createVllmChat({ client, now: deps.now }),
    embed: createVllmEmbed({ client, embedDim, chunkSize, concurrency: embedConcurrency }),
    rerank: createVllmRerank({ client }),
    imageEmbed: createVllmImageEmbed({ client, embedDim, concurrency: embedConcurrency }),
    summarize: createVllmSummarize({ client, concurrency: summarizeConcurrency }),
    engine,
  };
}
