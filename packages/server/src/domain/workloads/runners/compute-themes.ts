// runner: compute-themes — the discovery k-means theme pass. The `k` tunable follows the §7.2 precedence:
// per-run param → the user knob (`UserSettings.workloads.computeThemesK`, PD-75) → the runner floor const.
// Wraps `ctx.env.discovery.computeThemes`.

import type { Runner } from "../contract/runner";

// The runner floor for the cluster count when neither the run nor the user's settings supply a `k`.
const DEFAULT_THEME_K = 12;

export const computeThemesRunner: Runner<"compute-themes"> = async (
  ctx,
  params,
  report,
  signal,
) => {
  // §7.2 precedence: explicit per-run param wins, then the triggering user's `computeThemesK` knob, then the floor.
  const settings = await ctx.loadUserSettings();
  const k = params.k ?? settings.workloads.computeThemesK ?? DEFAULT_THEME_K;
  report({ message: `computing ${k} themes` });
  const result = await ctx.env.discovery.computeThemes({ k, signal });
  return { scanned: result.scanned, written: result.written };
};
