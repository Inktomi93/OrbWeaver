// `useAppearance` — the full synced `UserSettings.appearance` block (D44 §12.1), the source the shell
// stamps ALL its display axes from (density · elevation · chatWidthPct · fontScale · the metadata/effect
// toggles). The sanctioned cross-cutting trpc read shape (§11.0 — a feature reads a user DISPLAY pref
// via trpc, never a feature import; not domain coupling), and the never-suspend/never-
// crash posture: an unauthed/pending/errored read degrades to the ST-parity defaults, never undefined.
//
// THREE AXES HAVE A BETTER PENDING ANSWER THAN THEIR DEFAULT (#188 N-1, widened by #231): `reducedMotion`,
// `fontScale` and `density`. Degrading them to the schema default is not neutral — the shell stamps them
// on `<html>`/`.shell-grid` the moment it mounts, which CLOBBERS the boot replay `main.tsx` did from this
// device's remembered answer: the motion floor snaps back to the OS query, the root font-size snaps back
// to 1.0 (resizing every rem-derived shell dimension — the 0.20–0.34 boot CLS this closes), and the grid
// reflows from the wrong density. So while the read is unresolved the pending values are the device's
// HINT (`#state` appearance-boot-hint, localStorage, read synchronously); the instant the read lands, the
// server values are both what the app renders and what is written back to the hint. The server always
// wins — the hint is never consulted beside a resolved read.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTRPC } from "#data";
import { rememberAppearanceBootHint, useAppearanceBootHint } from "#state";

export function useAppearance(): AppearanceSettings {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const hint = useAppearanceBootHint();
  const synced = data?.config.appearance;
  const { reducedMotion, fontScale, density } = hint;
  // Written back as ONE authoritative slice, from the one seam that knows the read has landed.
  useEffect((): void => {
    if (synced !== undefined) {
      rememberAppearanceBootHint({ reducedMotion: synced.reducedMotion, fontScale: synced.fontScale, density: synced.density });
    }
  }, [synced]);
  if (synced !== undefined) {
    return synced;
  }
  // The pending block: the schema defaults for every axis this device cannot know, the remembered answer
  // for the three it can. No manual memo — the React Compiler owns that here (D70 house rule).
  return { ...DEFAULT_APPEARANCE_SETTINGS, reducedMotion, fontScale, density };
}
