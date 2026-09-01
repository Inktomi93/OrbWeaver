// Pure R7 prepaint/hydration reconciler. The browser recorder owns chronology; this function refuses a
// fake root theme, an intermediate default, a late swap, overflow, or an absent pre-ready sample.

import type { AppearancePrepaintEvidence } from "../../_shared/appearance-prepaint.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --matrix");

export interface HydratedAppearanceIdentity {
  readonly dataTheme: string | null;
  readonly fontScale: string;
  readonly reducedMotion: string | null;
}

export interface AppearancePrepaintVerdict {
  readonly sampled: number;
  readonly continuous: boolean;
  readonly actual: string;
}

export function evaluateAppearancePrepaint(evidence: AppearancePrepaintEvidence, hydrated: HydratedAppearanceIdentity | null): AppearancePrepaintVerdict {
  const readyIndex = evidence.samples.findIndex((entry) => entry.appReady !== null);
  const beforeReady = evidence.samples.slice(0, readyIndex === -1 ? evidence.samples.length : readyIndex);
  const prepaintSample = beforeReady.filter((entry) => entry.phase === "mutation").at(-1);
  const hydratedTheme = hydrated?.dataTheme ?? null;
  // The boot replay stamps only the non-default reduced arm. Absence before React is therefore the
  // authoritative full-motion value, while hydration spells the same value `false` for CSS selectors.
  const prepaintReducedMotion = prepaintSample?.reducedMotion ?? "false";
  const contradictoryThemeSample = evidence.samples.some((entry) => entry.dataTheme !== null && entry.dataTheme !== hydratedTheme);
  const lateThemeSwap = readyIndex !== -1 && evidence.samples.slice(readyIndex).some((entry) => entry.dataTheme !== hydratedTheme);
  const continuous =
    evidence.overflow === 0 &&
    prepaintSample !== undefined &&
    hydrated !== null &&
    prepaintSample.dataTheme === hydratedTheme &&
    prepaintSample.fontScale === hydrated.fontScale &&
    prepaintReducedMotion === hydrated.reducedMotion &&
    !contradictoryThemeSample &&
    !lateThemeSwap;
  return {
    sampled: Number(prepaintSample !== undefined),
    continuous,
    actual: JSON.stringify({
      sample: prepaintSample,
      hydrated,
      total: evidence.samples.length,
      contradictoryThemeSample,
      lateThemeSwap,
      overflow: evidence.overflow,
    }),
  };
}
