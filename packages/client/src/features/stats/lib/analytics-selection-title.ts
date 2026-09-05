// The Analytics section's `useSelectionTitle` — the mobile pushed frame's topbar names the DRILLED
// character, not the section (side-eye P2). Cache-first + gated, sharing the `character.get` read the drill
// surface already made; `null` until it lands ⇒ the shell prints the section label rather than a blank bar.

//
// WITH NOBODY DRILLED IT NAMES THE SECTION *AND ITS SIZE* (#1676, the #1670 class). On a phone the LIST pane
// IS the screen and the ONE-NAME rule (shell.css) sheds the LIST band's title — and the census travels INSIDE
// that title (`components/list-pane-header.tsx`), so the leaderboard's size was printed nowhere at all. The
// count goes back with the noun that survives, off the SAME `useAnalyticsCensus` the band reads, so the
// `N of TOTAL` relationship is stated once and identically in both regimes.

import { useGatedQuery, useTRPC } from "#data";
import { useSelectedAnalyticsCharacterId } from "#state";
import { useAnalyticsCensus } from "../hooks/use-analytics-census.ts";
import { ANALYTICS_SECTION_LABEL } from "./analytics-section-label.ts";

export function useAnalyticsSelectionTitle(): string | null {
  const trpc = useTRPC();
  const characterId = useSelectedAnalyticsCharacterId();
  const { data } = useGatedQuery(characterId, (id) => trpc.character.get.queryOptions({ characterId: id }));
  // Unconditional, above the early return: this is a hook, and the shell calls THIS hook unconditionally for
  // exactly the same reason (`section-registry.ts`, `NO_SELECTION_TITLE`).
  const census = useAnalyticsCensus();
  const name = data?.name ?? "";
  // THE CENSUS IS THE NO-SELECTION ARM, gated on the SELECTION rather than on "did a name land" (#1676):
  // with a member open this screen is that member's, so an unlanded name heals to the shell's section label,
  // never to the library's size — a true number about the wrong screen is not an improvement on a blank one.
  if (characterId !== null) {
    return name.length === 0 ? null : name;
  }
  // A ZERO CENSUS IS STILL SUPPRESSED, in the band's own spelling (`ListPaneHeader`: "a zero census is noise,
  // not information") — an unpopulated leaderboard says `Analytics` and lets its empty state teach.
  if (census === undefined || census === 0 || census === "0") {
    return null;
  }
  return `${ANALYTICS_SECTION_LABEL} · ${String(census)}`;
}
