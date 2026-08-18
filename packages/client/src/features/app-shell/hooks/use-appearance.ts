// `useAppearance` — the full synced `UserSettings.appearance` block (D44 §12.1), the source the shell
// stamps ALL its display axes from (density · elevation · chatWidthPct · fontScale · the metadata/effect
// toggles). The sanctioned cross-cutting trpc read shape (§11.0 — a feature reads a user DISPLAY pref
// via trpc, never a feature import; not domain coupling), and the never-suspend/never-
// crash posture: an unauthed/pending/errored read degrades to the ST-parity defaults, never undefined.
//
// ONE AXIS HAS A BETTER PENDING ANSWER THAN ITS DEFAULT: `reducedMotion` (#188 N-1). Degrading it to the
// schema default is not neutral — it makes the shell stamp `data-reduced-motion="false"` on <html> the
// moment it mounts, which CLOBBERS the boot replay `main.tsx` did from this device's remembered answer and
// hands the animation floor back to the OS media query for the rest of the read. So while the read is
// unresolved the pending value is the device's HINT (`#state` reduced-motion-hint, localStorage, read
// synchronously); the instant the read lands, the server value is both what the app renders and what is
// written back to the hint. The server always wins — the hint is never consulted beside a resolved read.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTRPC } from "#data";
import { rememberReducedMotionHint, useReducedMotionHint } from "#state";

/** The pending block for a device that remembers the pref ON — module-scope so the identity is stable. */
const PENDING_REDUCED_MOTION: AppearanceSettings = { ...DEFAULT_APPEARANCE_SETTINGS, reducedMotion: true };

export function useAppearance(): AppearanceSettings {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const hinted = useReducedMotionHint();
  const synced = data?.config.appearance;
  const authoritativeReducedMotion = synced?.reducedMotion;
  useEffect((): void => {
    if (authoritativeReducedMotion !== undefined) {
      rememberReducedMotionHint(authoritativeReducedMotion);
    }
  }, [authoritativeReducedMotion]);
  if (synced !== undefined) {
    return synced;
  }
  return hinted ? PENDING_REDUCED_MOTION : DEFAULT_APPEARANCE_SETTINGS;
}
