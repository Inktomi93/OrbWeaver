// The engine base-URL leaf: the port map + `engineBaseUrl`. Extracted from client.ts so BOTH the HTTP
// seam (client.ts) AND the sleep/wake control (fleet-control.ts, wake-gate.ts, supervisor.ts) can resolve a
// port without importing client.ts — which would form a cycle (client → wake-gate → fleet-control → client).
// A zero-dependency leaf beside engines.ts (identity) so nothing here reaches back up the subsystem.
//
// The HOST is env-declared (VLLM_ENGINE_HOST), default loopback: bare-metal and the all-in-one container
// run the fleet in the same network namespace. A slim app-only deployment pointing at an EXTERNAL engine
// (profile-2/D2, docs/plans/containerize/design.md) relocates the host; the egress
// internal-backend allowlist (infra/network/egress.ts) reads the SAME env key so the two can never drift.

import type { VLLM_ENGINES } from "./engines.ts";
import { fleetEnv as env } from "./env.ts";

type VllmEngine = (typeof VLLM_ENGINES)[number];

const PORTS: Record<VllmEngine, number> = {
  embed: env.VLLM_EMBED_PORT,
  rerank: env.VLLM_RERANK_PORT,
  gen: env.VLLM_GEN_PORT,
};

/** Base URL for an engine — `http://<VLLM_ENGINE_HOST>:<port>` (default host `127.0.0.1`). */
export function engineBaseUrl(engine: VllmEngine): string {
  return `http://${env.VLLM_ENGINE_HOST}:${PORTS[engine]}`;
}
