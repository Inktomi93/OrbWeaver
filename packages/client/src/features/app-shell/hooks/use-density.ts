// `useDensity` — the global density axis (UI-Arch §4: "Density is a SEPARATE axis, a user pref,
// attribute-driven — `data-density="comfortable|compact"`"). Reads the synced
// `UserSettings.appearance.density` (D44 §12.1) so the shell can stamp `data-density` on its root
// grid, where a compact override tightens the spacing tokens for the whole subtree (shell.css). The
// shell reading a user DISPLAY pref via `trpc.*` is a sanctioned cross-cutting read (§11.0 — features
// read cross-feature state via trpc, never a feature import); it is NOT domain coupling.
//
// Plain (non-suspense) query with a defaulted fallback: the shell must never suspend or crash on this
// (an unauthed/pending/errored read degrades to the ST-parity default, never undefined).

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";

export function useDensity(): AppearanceSettings["density"] {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.settings.getUserSettings.queryOptions());
  return data?.config.appearance.density ?? DEFAULT_APPEARANCE_SETTINGS.density;
}
