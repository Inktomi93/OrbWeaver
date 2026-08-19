// The active-command-value read, in its own module because `command.tsx` exports components and biome's
// useComponentExportOnlyModules forbids a non-component export beside them (a hook is not a component).

import { useCommandState } from "cmdk";

/**
 * The `value` of the currently ACTIVE (roving-highlighted) command item — cmdk's own selection state,
 * `""` when none. Must be called under a `<Command>`. Lets a composer react to KEYBOARD roving
 * (Arrow/Page/Home/End) — e.g. load the next page of an async list once the highlight reaches its last
 * row. cmdk only `scrollIntoView({block:"nearest"})`s the active item, so a purely scroll-bound loader
 * misses a keyboard move that does not actually scroll the container; this state signal does not.
 */
export function useActiveCommandValue(): string {
  return useCommandState((state) => state.value);
}
