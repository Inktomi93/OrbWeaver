// Supervisor→admin control bridge. The adoptive supervisor registers its control surface here at boot;
// the admin domain service reads it through the providers front door (no driver→driver import).
// Process-local, like the status registry next door.

import type { VLLM_ENGINES } from "./engines";

type VllmEngine = (typeof VLLM_ENGINES)[number];

export interface VllmEngineController {
  /** Manual admin restart: resets the engine's breaker (a human override IS the half-open probe) and
   *  bounces the engine. Resolves with a status line. */
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
