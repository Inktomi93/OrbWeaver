// The Extensions LIST chrome-band header (#1190) — the content the `.shell-panel-header` band wraps for the
// Extensions LIST panel: the "Extensions" title + a live page count. Flows into the band through the section
// definition's `listHeader` slot (`extensions-section.tsx`), the same definition-owned seam chats/corpus/
// presets/databank already ride — the domain-agnostic shell never names a feature.
//
// THE SECTION SHIPPED WITHOUT ONE (#1190 side-eye finding): every other rail section with a LIST pane names
// itself and its census in the band; Extensions alone left the slot unset, so its LIST pane opened bare where
// its siblings all open identified. This closes that gap, and ONLY that gap — the pane's list/empty/content
// behaviour is untouched (`extensions-switcher-surface.tsx` still owns the rows and the teaching empty).
//
// ONE VISIBLE CENSUS *PER REGIME* (#1676, the #1670 class). On a phone the ONE-NAME rule (shell.css) sheds
// this band's title and the census travels INSIDE it (`list-pane-header.tsx`: "THE COUNT TRAVELS WITH THE
// TITLE"), so the page roster's size was printed NOWHERE there. It now also rides the topbar's screen title
// (`lib/use-extensions-selection-title.ts`), the noun that survives; both call `useExtensionsCensus`.
//
// NO ACTION, browse-shaped like Corpus (§2 action-ownership): a page is registered by a PLUGIN, not created
// from this band, so there is no create verb to carry. The count is bare — `usePluginPages()` already reads
// the CALLER's full, unfiltered roster (no search/facet narrows this switcher), so there is no "N of TOTAL"
// split to state; a flat count is exactly the databank/preset-unfiltered idiom (`ListPaneHeader` already omits
// a `0` census, so the band goes quiet rather than printing "Extensions 0" while the reads settle).

import type { ReactElement } from "react";
import { ListPaneHeader } from "#components";
import { useExtensionsCensus } from "../hooks/use-extensions-census.ts";
import { EXTENSIONS_SECTION_LABEL } from "../lib/extensions-section-label.ts";

export function ExtensionsListHeader(): ReactElement {
  const count = useExtensionsCensus();
  return <ListPaneHeader count={count} title={EXTENSIONS_SECTION_LABEL} />;
}
