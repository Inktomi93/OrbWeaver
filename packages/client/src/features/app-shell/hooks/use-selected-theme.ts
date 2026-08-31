// `useSelectedTheme` — resolves the user's ACTIVE theme entity (D44 §12.1): read
// `UserSettings.theme.selectedThemeId`, then fetch that `themes` row. `null` (no selection / a stale or
// deleted id) resolves to `null` here → the shell applies the Hearth default (no [data-theme], empty
// override). This is Layer 1 of the three-layer model (the viewer's OWN global theme); it is fetched for
// THIS user only and never pushed to other participants (custom CSS stays own-client — §12.0 TRUSTED tier).
//
// Two gated reads, both never-suspend/never-crash (the shell must degrade to default, never blank): the
// settings read defaults to no selection, and the theme read is gated on a non-null id (useGatedQuery).
//
// `useDataTheme` IS THE `[data-theme]` DERIVATION'S ONE HOME (#231). It used to be a one-liner at the
// app-shell call site, and that is precisely where the dark→light cold-boot swap lived: the value is
// null until BOTH chained reads land, so a Light user's first paint was the base DARK palette and the
// swap arrived ~1s later, animating colour-bearing properties on everything (measured 100–167ms frame
// gaps). Here the UNRESOLVED window answers with this device's remembered `[data-theme]` instead, which
// `main.tsx` has already stamped before React mounted — so the shell's own first commit RECONCILES with
// the replay rather than clobbering it back to the base palette. The resolved answer always wins and is
// written back for the next boot.

import type { Theme } from "@orb/contracts/theme";
import type { ThemeId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useGatedQuery, useTRPC } from "#data";
import { setBootReadPending } from "#lib";
import type { SeedThemeName } from "#state";
import { isSeedThemeName, rememberDataThemeHint, useAppearanceBootHint } from "#state";

/** The boot-read key this hook owns (`boot-reads.ts`): the theme chain, held until it settles. */
const THEME_BOOT_READ = "theme";

/** The `[data-theme]` value for a resolved theme row: a SEED palette paints from its generated block. */
function dataThemeOf(theme: Theme | null): SeedThemeName | null {
  if (theme?.isSeed !== true) {
    return null;
  }
  const name = theme.name.toLowerCase();
  return isSeedThemeName(name) ? name : null;
}

/**
 * The active theme ROW (`null` = the Hearth default) and the root `[data-theme]` value the shell stamps
 * from it — returned together because they come from the SAME two chained reads and differ only in how
 * an unresolved read is answered: the row degrades to `null` (an empty ThemeScope override is harmless
 * and correct), while the attribute degrades to this device's remembered answer, which is already on
 * `<html>` from the pre-createRoot replay.
 */
export function useSelectedTheme(): { readonly theme: Theme | null; readonly dataTheme: SeedThemeName | null } {
  const trpc = useTRPC();
  const settingsQuery = useQuery(trpc.settings.getUserSettings.queryOptions());
  const settings = settingsQuery.data;
  const selectedThemeId = (settings?.config.theme.selectedThemeId ?? null) as ThemeId | null;
  const themeQuery = useGatedQuery(selectedThemeId, (id) => trpc.settings.getTheme.queryOptions({ id }));
  const data = themeQuery.data;
  const { dataTheme: hinted } = useAppearanceBootHint();
  // RESOLVED means: the settings read landed AND (there is no selection, or the theme row itself landed).
  const settingsLanded = settings !== undefined;
  const resolved = settingsLanded && (selectedThemeId === null || data !== undefined);
  const authoritative = dataThemeOf(data ?? null);
  useEffect((): void => {
    if (resolved) {
      rememberDataThemeHint(authoritative);
    }
  }, [resolved, authoritative]);
  // THE BOOT-CRITICAL READ (#282). Readiness (`data-app-ready`, agent-bridge.ts) must not settle in the GAP
  // between `settings.getUserSettings` resolving and the CHAINED `settings.getTheme` STARTING — the cache is
  // momentarily idle there and the boot veil would lift onto the base palette a beat before the resolved
  // theme swaps it (the cold-cache polarity flash on a device with no boot hint). Hold readiness while the
  // theme chain is still resolving. The condition is deliberately SETTLED-EITHER-WAY (a `status` leaving
  // `"pending"` is success OR error), NOT `resolved` above: `resolved` stays false on a settings/theme
  // ERROR, and gating on it would hang readiness to the 20s ceiling instead of degrading to the default
  // palette. A skipped (id === null) theme query never leaves `"pending"`, so it is excluded explicitly.
  const themeChainSettled = settingsQuery.status !== "pending" && (selectedThemeId === null || themeQuery.status !== "pending");
  useEffect((): void => {
    setBootReadPending(THEME_BOOT_READ, !themeChainSettled);
  }, [themeChainSettled]);
  // Clear on unmount ONLY (a separate empty-dep effect, never a cleanup on the setter above — a cleanup
  // there would fire on every re-run, momentarily clearing the read and racing an early settle).
  useEffect((): (() => void) => (): void => setBootReadPending(THEME_BOOT_READ, false), []);
  return { theme: data ?? null, dataTheme: resolved ? authoritative : hinted };
}
