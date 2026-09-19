// The engine POSTURE resolver (A.4) — the ONE topology decision, `off | adopt-only | adopt-or-start`,
// replacing the VLLM_DISABLED/STACK_ENGINES combo folklore. When ENGINES_POSTURE is set it wins outright;
// otherwise the deprecated pair is MAPPED with a VISIBLE log line (never a silent re-semantics):
//   VLLM_DISABLED=true                          → off
//   STACK_ENGINES=yes                           → adopt-only   (+ boot grace, keyed on spawner-pidfile)
//   VLLM_DISABLED=false/unset (no STACK_ENGINES) → adopt-only   (the SCHEMA DEFAULT; see below)
//
// THE UNSET DEFAULT IS `adopt-only` (owner ruling 2026-09-19, #2421). It used to be `adopt-or-start`, so a
// process that merely BOOTED — a snap stage, an e2e run, a lane's server, an import script — could wake a
// sleeping fleet or cold-spawn 38 GB of vLLM as a side effect of touching a model role. Managing a fleet is
// now something an operator ASKS for (`ENGINES_POSTURE=adopt-or-start`, which is what `pnpm engines` runs
// under); an unset env uses engines that are ALREADY up and never wakes or spawns one. The unset case is
// therefore no longer a deprecation WARN — it is the documented default, and it logs a plain posture line.
// Pure: the raw env values + the log callbacks are injected, so the mapping is unit-testable and this file
// touches no process.env. `foundation/env` owns the ONE process.env read and calls this with its parsed floor.

export const ENGINES_POSTURES = ["off", "adopt-only", "adopt-or-start"] as const;
// @orb-waive no-inline-types(EnginesPosture): the §7.5 keystone — this derived type MUST co-locate with its `as const` tuple, and ENGINES_POSTURES is a server-foundation env axis (not a cross-boundary contract), so its one home is here beside the tuple it derives from; hoisting the alias away from its source would violate §7.5. Ends when the posture axis becomes a cross-boundary contract and the tuple moves to @orb/contracts with it.
export type EnginesPosture = (typeof ENGINES_POSTURES)[number];

/** The deprecated inputs the resolver falls back to when ENGINES_POSTURE is unset. `vllmDisabled` is the
 *  parsed boolean; `stackEngines` is the raw "yes"/"no". */
export interface PostureFallbackInput {
  readonly posture: EnginesPosture | undefined;
  readonly vllmDisabled: boolean;
  readonly stackEngines: "yes" | "no";
}

/** The two log seams the resolution can take. They are SEPARATE because they carry opposite operator
 *  meanings: `deprecation` is "your env spells a retired knob, migrate it" (a WARN), while `defaulted` is
 *  "you set nothing and this is what that means" (an INFO line — the unset case is sanctioned, #2421). One
 *  callback for both is what made the safe default read as a warning every boot. */
export interface PostureResolutionLog {
  readonly deprecation: (msg: string) => void;
  readonly defaulted: (msg: string) => void;
}

/** Resolve the effective posture. Exactly one of `log.deprecation` / `log.defaulted` fires when the knob is
 *  unset, so the boot log always says WHY the posture is what it is; neither fires when it is set. */
export function resolveEnginesPosture(input: PostureFallbackInput, log: PostureResolutionLog): EnginesPosture {
  if (input.posture !== undefined) {
    return input.posture;
  }
  if (input.vllmDisabled) {
    log.deprecation("VLLM_DISABLED=true is DEPRECATED — mapped to ENGINES_POSTURE=off. Set ENGINES_POSTURE=off explicitly.");
    return "off";
  }
  if (input.stackEngines === "yes") {
    log.deprecation("STACK_ENGINES=yes is DEPRECATED — mapped to ENGINES_POSTURE=adopt-only. Set ENGINES_POSTURE=adopt-only explicitly.");
    return "adopt-only";
  }
  log.defaulted("ENGINES_POSTURE unset — adopt-only: using engines that are already up, never waking or spawning; set adopt-or-start to manage a fleet.");
  return "adopt-only";
}

/** The supervisor is registered (backend available) for any posture but `off`. */
export function postureRegistersBackend(posture: EnginesPosture): boolean {
  return posture !== "off";
}

/** Only the fleet MANAGER posture spawns engines + owns the auto-sleep timer; adopt-only is a passive consumer. */
export function postureManages(posture: EnginesPosture): boolean {
  return posture === "adopt-or-start";
}

/** The one boot fact `entry/lifecycle` derives from posture × the local-GPU probe: is the vLLM family
 *  effectively unavailable on this box? `off` ⇒ always. The MANAGING posture spawns engines on THIS host,
 *  so it requires a local GPU; `adopt-only` is a passive consumer of engines that may live ELSEWHERE
 *  (VLLM_ENGINE_HOST — profile-2/D2, docs/design/containerize-prod-image-spec.md §3.6), so a GPU-less box
 *  still registers the backend and probes/adopts. */
export function effectiveVllmDisabled(posture: EnginesPosture, gpuPresent: boolean): boolean {
  if (!postureRegistersBackend(posture)) {
    return true;
  }
  return postureManages(posture) && !gpuPresent;
}
