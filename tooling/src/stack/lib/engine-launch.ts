// The per-engine LAUNCH DECISION — the pure half of `pnpm engines`. `ops/engines.ts` owns the imperative
// half (lock, reap, spawn, health-wait, identity capture, pidfile, foreground hold) and consults this for
// the one question that has consequences: given what the port and the GPUs say, do we adopt, refuse, skip
// or spawn?
//
// WHY IT LIVES HERE (#764): the decision used to be inline in the launcher, which is a PROGRAM (it ends in
// a module-scope `await runTool(main)`), so the only way to reach it from a test was to neuter the entry
// runner with module mocks — the internal-mock shape `Spine-Testing.md` §3 bans. The health-refusal
// behaviour that arm protects (an occupied-but-unproven port must never authorize a duplicate spawn) went
// UNCOVERED when that test was deleted. Here the three I/O edges are INJECTED (`EngineLaunchProbes`), so
// the real decision runs in a test with real probes over a planted `fetch` and zero mocks.
//
// THE ORDER IS THE INVARIANT, not an implementation detail: health first, identity second, headroom third.
// A port that answers anything other than a clean `/health` is `unproven`, and an unproven port is refused
// BEFORE the VRAM budget is even read — mid-boot VRAM is ambiguous, and reading it there is how the
// 2026-08-03 duplicate-fleet defect talked itself into a second spawn.
import type { EngineLaunchAction, EngineLaunchDecision, EngineLaunchModels, EngineLaunchProbes, EngineRole } from "../contract/types.ts";

/** Which decisions count as an IDENTITY FAILURE — the tally `ops/engines.ts` turns into `EXIT.toolError`.
 *  A REFUSED port means the fleet is not in the state the operator asked for and something else is holding
 *  a port we own; a headroom `skip` is a clean, deliberate no-boot. */
export const ENGINE_LAUNCH_IDENTITY_FAILURE: Record<EngineLaunchAction, boolean> = {
  adopt: false,
  refuse: true,
  skip: false,
  spawn: false,
};

/** The model ids a healthy listener must advertise to be THIS role's engine. `gen` is spelled twice
 *  because vLLM serves the generation model under both its bare name and its org-qualified id. */
export function expectedAdoptionModels(engine: EngineRole, launch: EngineLaunchModels): readonly string[] {
  if (engine === "embed") {
    return [launch.embedModel];
  }
  if (engine === "rerank") {
    return [launch.rerankModel];
  }
  return [launch.genModel.split("/").pop() ?? launch.genModel, launch.genModel];
}

/** One engine's launch verdict, with the exact operator line the launcher prints for it. */
export async function decideEngineLaunch(opts: {
  readonly engine: EngineRole;
  readonly port: number;
  readonly launch: EngineLaunchModels;
  readonly probes: EngineLaunchProbes;
}): Promise<EngineLaunchDecision> {
  const { engine, port, launch, probes } = opts;
  const health = await probes.health(port);
  if (health.kind === "healthy") {
    const mismatch = await probes.adoption(engine, port, expectedAdoptionModels(engine, launch));
    if (mismatch !== null) {
      return { action: "refuse", message: `${engine}: ADOPTION REFUSED on :${port} — ${mismatch}; occupied listener left untouched.` };
    }
    return { action: "adopt", message: `${engine} already serving (:${port}) — adopted in place, no spawn.` };
  }
  if (health.kind === "unproven") {
    return {
      action: "refuse",
      message: `${engine}: ADOPTION REFUSED on :${port} — health probe failed (${health.reason}); occupied listener state is unproven and no duplicate will spawn.`,
    };
  }
  // The cold-start headroom gate (B.6): vLLM's memory profiler OOMs mid-boot into insufficient free VRAM.
  // Reconcile has already run, so a held GPU is a REAL foreign tenant, never our own corpse.
  const budget = await probes.headroom(engine);
  if (!budget.ok) {
    return { action: "skip", message: `${engine}: BOOT REFUSED — ${budget.message}` };
  }
  return { action: "spawn", message: `starting ${engine} :${port}` };
}
