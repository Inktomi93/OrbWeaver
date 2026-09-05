// useExtensionsCensus — the registered-pages census, in ONE spelling. Its own module since #1676 because it
// has TWO readers: the LIST chrome band (`components/extensions-list-header.tsx`) and the phone topbar's
// screen title (`lib/use-extensions-selection-title.ts`), which is where the count lives once the ONE-NAME
// rule (shell.css) sheds the band's title.
//
// It is a LENGTH, not a server count, and that is the honest number here: `usePluginPages` already reads the
// CALLER's full, unfiltered roster (no search or facet narrows this switcher) off two cache-first reads both
// readers share, so there is no "N of TOTAL" split to state — the flat count is the databank/preset-unfiltered
// idiom. `0` while the two reads settle is the same fact as an empty roster, and both readers suppress it.

import { usePluginPages } from "./use-plugin-pages.ts";

export function useExtensionsCensus(): number {
  return usePluginPages().length;
}
