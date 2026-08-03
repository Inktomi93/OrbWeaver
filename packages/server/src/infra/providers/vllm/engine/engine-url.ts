// The engine loopback-URL leaf: the port map + `engineBaseUrl`. Extracted from client.ts so BOTH the HTTP
// seam (client.ts) AND the sleep/wake control (fleet-control.ts, wake-gate.ts, supervisor.ts) can resolve a
// port without importing client.ts — which would form a cycle (client → wake-gate → fleet-control → client).
// A zero-dependency leaf beside engines.ts (identity) so nothing here reaches back up the subsystem.

import { env } from "#foundation/env";
import type { VLLM_ENGINES } from "./engines.ts";

type VllmEngine = (typeof VLLM_ENGINES)[number];

const PORTS: Record<VllmEngine, number> = {
  embed: env.VLLM_EMBED_PORT,
  rerank: env.VLLM_RERANK_PORT,
  gen: env.VLLM_GEN_PORT,
};

/** Loopback base URL for an engine — `http://127.0.0.1:<port>`. */
export function engineBaseUrl(engine: VllmEngine): string {
  return `http://127.0.0.1:${PORTS[engine]}`;
}
