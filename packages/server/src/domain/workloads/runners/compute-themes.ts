// runner: compute-themes — the discovery k-means theme pass. The `k` tunable follows the §7.2 precedence:
// per-run param → (the user-settings tier slots in when `UserSettings.workloads.themes.k` lands — FLAG[PD-75]) →
// the runner floor const. Wraps `ctx.env.discovery.computeThemes`.

import type { Runner } from "../contract/runner";

// The runner floor for the cluster count when the run supplies no `k` (and no user knob yet).
const DEFAULT_THEME_K = 12;

export const computeThemesRunner: Runner<"compute-themes"> = async (
  ctx,
  params,
  report,
  signal,
) => {
  const k = params.k ?? DEFAULT_THEME_K;
  report({ message: `computing ${k} themes` });
  const result = await ctx.env.discovery.computeThemes({ k, signal });
  return { scanned: result.scanned, written: result.written };
};
