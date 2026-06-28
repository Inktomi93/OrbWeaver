// infra/providers/vllm/engine/engine-control — the supervisor→admin control bridge.
//
// The adoptive supervisor registers its control surface here at boot; the admin domain service reads it
// (domain → providers points DOWN the layer cake, so tRPC reaches the supervisor through the providers
// front door without a driver→driver import). Engine identity comes from the ./engines leaf. Process-local,
// like the status registry next door.

import type { VLLM_ENGINES } from "./engines";

type VllmEngine = (typeof VLLM_ENGINES)[number];

/** The supervisor's manual-control surface — the infra DI seam the admin panel reaches through. */
export interface VllmEngineController {
  /** Manual admin restart: RESETS the engine's breaker (a human override IS the half-open probe) and
   *  bounces the engine — owned engines via the group-kill + respawn path, adopted ones by terminating
   *  the port owner so the monitor's takeover spawns an owned replacement. Resolves with a status line. */
  readonly restart: (engine: VllmEngine) => Promise<string>;
}

let controller: VllmEngineController | null = null;

/** The supervisor registers (and on drain, deregisters with `null`) its control surface. */
export function registerVllmEngineController(c: VllmEngineController | null): void {
  controller = c;
}

/** The admin service reads the live controller — `null` when the supervisor isn't running (no GPU / drained). */
export function getVllmEngineController(): VllmEngineController | null {
  return controller;
}
