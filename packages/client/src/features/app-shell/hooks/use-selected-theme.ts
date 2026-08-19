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
import { rememberDataThemeHint, useAppearanceBootHint } from "#state";

/** The `[data-theme]` value for a resolved theme row: a SEED palette paints from its generated block. */
function dataThemeOf(theme: Theme | null): string | null {
  return theme?.isSeed === true ? theme.name.toLowerCase() : null;
}

/**
 * The active theme ROW (`null` = the Hearth default) and the root `[data-theme]` value the shell stamps
 * from it — returned together because they come from the SAME two chained reads and differ only in how
 * an unresolved read is answered: the row degrades to `null` (an empty ThemeScope override is harmless
 * and correct), while the attribute degrades to this device's remembered answer, which is already on
 * `<html>` from the pre-createRoot replay.
 */
export function useSelectedTheme(): { readonly theme: Theme | null; readonly dataTheme: string | null } {
  const trpc = useTRPC();
  const { data: settings } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const selectedThemeId = (settings?.config.theme.selectedThemeId ?? null) as ThemeId | null;
  const { data } = useGatedQuery(selectedThemeId, (id) => trpc.settings.getTheme.queryOptions({ id }));
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
  return { theme: data ?? null, dataTheme: resolved ? authoritative : hinted };
}
