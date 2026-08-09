// The keystroke→REQUEST damper. Distinct from `useDeferredValue` and not a substitute for it: deferring
// changes which RENDER a value lands in (a React scheduling concern, UI-Arch §4a), while a value that feeds a
// SERVER query needs the trips themselves bounded — otherwise "azarael" is eight round trips, seven of them
// already stale when they land.
//
// Used by the chats pane's server-side search (owner ruling 2026-08-09: chat search resolves on the server
// over the whole library, not client-side over the loaded pages). The pre-existing corpus search box
// (`corpus-list-surface.tsx`) defers without damping — it is the older shape, not a second opinion.

import { useEffect, useState } from "react";

/** `value`, held back until it has stopped changing for `delayMs`. The FIRST value passes through on mount
 *  (a cold surface must not sit blank for a debounce interval before its first read). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return (): void => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
