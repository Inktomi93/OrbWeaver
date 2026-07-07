// `useSelectedTheme` — resolves the user's ACTIVE theme entity (D44 §12.1): read
// `UserSettings.theme.selectedThemeId`, then fetch that `themes` row. `null` (no selection / a stale or
// deleted id) resolves to `null` here → the shell applies the Hearth default (no [data-theme], empty
// override). This is Layer 1 of the three-layer model (the viewer's OWN global theme); it is fetched for
// THIS user only and never pushed to other participants (custom CSS stays own-client — §12.0 TRUSTED tier).
//
// Two gated reads, both never-suspend/never-crash (the shell must degrade to default, never blank): the
// settings read defaults to no selection, and the theme read is gated on a non-null id (useGatedQuery).

import type { Theme } from "@orb/contracts/theme";
import type { ThemeId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import { useGatedQuery, useTRPC } from "#data";

/** The resolved active theme row (its wire shape is `Theme`), or `null` for "the Hearth default". */
export function useSelectedTheme(): Theme | null {
  const trpc = useTRPC();
  const { data: settings } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const selectedThemeId = (settings?.config.theme.selectedThemeId ?? null) as ThemeId | null;
  const { data } = useGatedQuery(selectedThemeId, (id) =>
    trpc.settings.getTheme.queryOptions({ id }),
  );
  return data ?? null;
}
