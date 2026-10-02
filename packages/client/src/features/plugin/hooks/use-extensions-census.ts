// useExtensionsCensus — the registered-pages census, in ONE spelling. Its own module since #1676 because it
// has TWO readers: the LIST chrome band (`hooks/use-extensions-list-header.tsx`) and the phone topbar's
// screen title (`lib/use-extensions-selection-title.ts`), which is where the count lives once the ONE-NAME
// rule (shell.css) sheds the band's title.
//
// The shared roster projection counts the same filtered rows the finder paints, including `0 of N`.

import { useExtensionsRoster } from "./use-extensions-roster.ts";

export function useExtensionsCensus(): number | string {
  return useExtensionsRoster().census;
}
