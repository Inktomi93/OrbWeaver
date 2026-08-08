// The engine POSTURE resolver (A.4) — the ONE topology decision, `off | adopt-only | adopt-or-start`,
// replacing the VLLM_DISABLED/STACK_ENGINES combo folklore. When ENGINES_POSTURE is set it wins outright;
// otherwise the deprecated pair is MAPPED with a VISIBLE log line (never a silent re-semantics):
//   VLLM_DISABLED=true                          → off
//   STACK_ENGINES=yes                           → adopt-only   (+ boot grace, keyed on spawner-pidfile)
//   VLLM_DISABLED=false/unset (no STACK_ENGINES) → adopt-or-start  (today's spawn-if-down intent; the
//                                                  CHILD-spawn mechanics change is the fix, not a semantics
//                                                  change)
// Pure: the raw env values + a log callback are injected, so the mapping is unit-testable and this file
// touches no process.env. `foundation/env` owns the ONE process.env read and calls this with its parsed floor.

export const ENGINES_POSTURES = ["off", "adopt-only", "adopt-or-start"] as const;
// @orb-gate-ignore no-inline-types: the §7.5 keystone — this derived type MUST co-locate with its `as const`
// tuple, and ENGINES_POSTURES is a server-foundation env axis (not a cross-boundary contract) — its one home
// is here beside the tuple it derives from; hoisting the alias away from its source would violate §7.5.
export type EnginesPosture = (typeof ENGINES_POSTURES)[number];

/** The deprecated inputs the resolver falls back to when ENGINES_POSTURE is unset. `vllmDisabled` is the
 *  parsed boolean; `stackEngines` is the raw "yes"/"no". */
export interface PostureFallbackInput {
  readonly posture: EnginesPosture | undefined;
  readonly vllmDisabled: boolean;
  readonly stackEngines: "yes" | "no";
}

/** Resolve the effective posture. `deprecate` is called (once) with a human line when the legacy pair is
 *  mapped, so the boot log shows the migration explicitly. */
export function resolveEnginesPosture(input: PostureFallbackInput, deprecate: (msg: string) => void): EnginesPosture {
  if (input.posture !== undefined) {
    return input.posture;
  }
  if (input.vllmDisabled) {
    deprecate("VLLM_DISABLED=true is DEPRECATED — mapped to ENGINES_POSTURE=off. Set ENGINES_POSTURE=off explicitly.");
    return "off";
  }
  if (input.stackEngines === "yes") {
    deprecate("STACK_ENGINES=yes is DEPRECATED — mapped to ENGINES_POSTURE=adopt-only. Set ENGINES_POSTURE=adopt-only explicitly.");
    return "adopt-only";
  }
  deprecate(
    "Neither ENGINES_POSTURE nor VLLM_DISABLED/STACK_ENGINES set — defaulting to ENGINES_POSTURE=adopt-or-start (the fleet manager). Set it explicitly.",
  );
  return "adopt-or-start";
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
