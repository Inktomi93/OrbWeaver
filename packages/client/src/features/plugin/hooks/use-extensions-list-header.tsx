// The Extensions LIST chrome-band header (#1190) — the content the `.shell-panel-header` band wraps for the
// Extensions LIST panel: the "Extensions" title + a live page count. Flows into the band through the section
// definition's `useListHeader` data slot (`extensions-section.tsx`), the same definition-owned seam chats/corpus/
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
// NO ACTION, browse-shaped like Corpus (§2 action-ownership): pages are registered by plugins.
// The count follows the finder's shared filter. A filtered zero carries its total rather than disappearing.

// The hook supplies view data; the shell owns the band renderer. Actions and overlays retain their existing behavior.

import type { ListPaneHeaderView } from "#lib";
import { useExtensionsCensus } from "../hooks/use-extensions-census.ts";
import { EXTENSIONS_SECTION_LABEL } from "../lib/extensions-section-label.ts";

export function useExtensionsListHeader(): ListPaneHeaderView {
  const count = useExtensionsCensus();
  return { count, title: EXTENSIONS_SECTION_LABEL };
}
