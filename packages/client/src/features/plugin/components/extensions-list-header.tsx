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
// NO ACTION, browse-shaped like Corpus (§2 action-ownership): a page is registered by a PLUGIN, not created
// from this band, so there is no create verb to carry. The count is bare — `usePluginPages()` already reads
// the CALLER's full, unfiltered roster (no search/facet narrows this switcher), so there is no "N of TOTAL"
// split to state; a flat count is exactly the databank/preset-unfiltered idiom (`ListPaneHeader` already omits
// a `0` census, so the band goes quiet rather than printing "Extensions 0" while the reads settle).

import type { ReactElement } from "react";
import { ListPaneHeader } from "#components";
import { usePluginPages } from "../hooks/use-plugin-pages.ts";

export function ExtensionsListHeader(): ReactElement {
  const pages = usePluginPages();
  return <ListPaneHeader count={pages.length} title="Extensions" />;
}
