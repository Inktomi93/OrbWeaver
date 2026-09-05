// The Presets section's `useSelectionTitle` — the mobile pushed frame's topbar names the open PRESET, not
// the section (side-eye P2). Cache-first + gated, sharing the `preset.get` read the editor already made;
// `null` until it lands ⇒ the shell prints the section label rather than a blank bar.

//
// WITH NO PRESET OPEN IT NAMES THE SECTION *AND ITS SIZE* (#1676, the #1670 class). On a phone the LIST pane
// IS the screen and the ONE-NAME rule (shell.css) sheds the LIST band's title — and the census travels INSIDE
// that title (`components/list-pane-header.tsx`), so the library's size was printed nowhere at all. The count
// goes back with the noun that survives, off the SAME `usePresetCensus` the band reads, so the filtered
// `0 of 5` arm reads identically in both regimes.

import { useGatedQuery, useTRPC } from "#data";
import { useSelectedPresetId } from "#state";
import { usePresetCensus } from "../hooks/use-preset-census.ts";
import { PRESETS_SECTION_LABEL } from "./presets-section-label.ts";

export function usePresetSelectionTitle(): string | null {
  const trpc = useTRPC();
  const presetId = useSelectedPresetId();
  const { data } = useGatedQuery(presetId, (id) => trpc.preset.get.queryOptions({ id }));
  // Unconditional, above the early return: this is a hook, and the shell calls THIS hook unconditionally for
  // exactly the same reason (`section-registry.ts`, `NO_SELECTION_TITLE`).
  const census = usePresetCensus();
  const name = data?.name ?? "";
  // THE CENSUS IS THE NO-SELECTION ARM, gated on the SELECTION rather than on "did a name land" (#1676):
  // with a member open this screen is that member's, so an unlanded name heals to the shell's section label,
  // never to the library's size — a true number about the wrong screen is not an improvement on a blank one.
  if (presetId !== null) {
    return name.length === 0 ? null : name;
  }
  // A ZERO CENSUS IS STILL SUPPRESSED, in the band's own spelling (`ListPaneHeader`: "a zero census is noise,
  // not information") — an empty library says `Presets` and lets its empty state do the teaching.
  if (census === undefined || census === 0 || census === "0") {
    return null;
  }
  return `${PRESETS_SECTION_LABEL} · ${String(census)}`;
}
