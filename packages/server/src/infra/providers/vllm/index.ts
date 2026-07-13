// Local multi-role engine (its own subsystem, not a chat-backend peer). `createVllmBackend(deps)` returns
// a sealed {@link ProviderBackend} whose five INDEPENDENT surfaces (chat/embed/rerank/imageEmbed/
// summarize) run against ONE engine, plus the engine lifecycle handle `entry/` wires at boot. `now` is
// injected (no-raw-clock); CONCURRENCY defaults are NOT env keys (settings-tier knob, providers.md §7.2).

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
// Surfaces are imported PER FILE (no surfaces/ barrel — `vllm-surface-isolation` gate forbids one);
// this root file is not under surfaces/, so aggregating here is the legal seam.
import { createVllmChat } from "./surfaces/chat";
import { createVllmEmbed } from "./surfaces/embed";
import { createVllmImageEmbed } from "./surfaces/image-embed";
import { createVllmRerank } from "./surfaces/rerank";
import { createVllmSummarize } from "./surfaces/summarize";

// Boot GPU-presence probe — re-exported for entry; the supervisor reads the same home (one `nvidia-smi`
// probe in the codebase).
export { detectGpu } from "./engine";
export { createVllmChat } from "./surfaces/chat";
export { createVllmEmbed } from "./surfaces/embed";
export { createVllmImageEmbed } from "./surfaces/image-embed";
export { createVllmRerank } from "./surfaces/rerank";
export { createVllmSummarize } from "./surfaces/summarize";

type VllmEngine = (typeof VLLM_ENGINES)[number];

const DEFAULT_EMBED_CONCURRENCY = 4;
const DEFAULT_SUMMARIZE_CONCURRENCY = 4;

/** Engine lifecycle handle `entry/` + the admin panel wire; separate from the role surface (surfaces
 *  EXECUTE, this OWNS the supervised processes). */
export interface VllmEngineHandle {
  readonly start: () => () => void;
  readonly status: () => Record<string, EngineStatusRecord>;
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
}

/** Builds the vLLM subsystem: the five surfaces bound to one engine + the lifecycle handle. */
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
