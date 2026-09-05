// What the MOBILE topbar calls the open extension page — the section's `useSelectionTitle` (the shell calls it
// unconditionally inside a component keyed on the active section, so it may read the section's own cache).
//
// It names the PAGE, never the section: on a phone the pushed frame's bar is the only thing telling a person
// where they are, and "Extensions" over someone's hub browser names the shelf instead of the book. `null` = no
// page open, or the read has not landed — the shell then prints the section label, never a blank bar.

//
// WITH NO PAGE OPEN IT NAMES THE SECTION *AND ITS SIZE* (#1676, the #1670 class). On a phone the LIST pane IS
// the screen and the ONE-NAME rule (shell.css) sheds the LIST band's title — and the census travels INSIDE
// that title (`components/list-pane-header.tsx`), so how many pages you have was printed nowhere at all. The
// count goes back with the noun that survives; it is the same `useExtensionsCensus` the band prints, over the
// same two cache-first reads this file already makes.

import { usePluginPageKey } from "#state";
import { useExtensionsCensus } from "../hooks/use-extensions-census.ts";
import { usePluginPages } from "../hooks/use-plugin-pages.ts";
import { EXTENSIONS_SECTION_LABEL } from "./extensions-section-label.ts";

export function useExtensionsSelectionTitle(): string | null {
  const key = usePluginPageKey();
  const pages = usePluginPages();
  // Unconditional, above the early return: this is a hook, and the shell calls THIS hook unconditionally for
  // exactly the same reason (`section-registry.ts`, `NO_SELECTION_TITLE`).
  const census = useExtensionsCensus();
  if (key !== null) {
    return pages.find((page) => page.key === key)?.title ?? null;
  }
  // A ZERO CENSUS IS SUPPRESSED, in the band's own spelling (`ListPaneHeader`: "a zero census is noise, not
  // information") — with no pages registered the bar says `Extensions` and the pane's teaching empty explains
  // why there are none. Zero is also what an unsettled read looks like here, and neither is a size claim.
  if (census === 0) {
    return null;
  }
  return `${EXTENSIONS_SECTION_LABEL} · ${String(census)}`;
}
