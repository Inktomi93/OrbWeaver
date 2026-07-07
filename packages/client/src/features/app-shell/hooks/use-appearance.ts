// `useAppearance` — the full synced `UserSettings.appearance` block (D44 §12.1), the source the shell
// stamps ALL its display axes from (density · elevation · chatWidthPct · fontScale · the metadata/effect
// toggles). Same sanctioned cross-cutting trpc read as `useDensity` (§11.0 — a feature reads a user
// DISPLAY pref via trpc, never a feature import; not domain coupling), and the same never-suspend/never-
// crash posture: an unauthed/pending/errored read degrades to the ST-parity defaults, never undefined.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";

export function useAppearance(): AppearanceSettings {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.settings.getUserSettings.queryOptions());
  return data?.config.appearance ?? DEFAULT_APPEARANCE_SETTINGS;
}
