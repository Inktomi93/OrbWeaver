// The library's §3.7 BACK-FOCUS hook — extracted from `character-library-surface.tsx` (component-size cap):
// imperative, DOM-poking, and entirely about focus, so it is the surface's least surface-y part.

import type { CharacterId } from "@orb/kit/ids";
import type { RefObject } from "react";
import { useEffect, useState } from "react";

/** How many frames the restore waits for the virtualizer to mount her row before giving up. */
const MAX_ROW_FOCUS_FRAMES = 30;

/** The minimal row shape this needs — the name is what the row is FOUND by. */
interface FocusableRow {
  readonly id: string;
  readonly name: string;
}

/** Restore keyboard focus to one character's ROW once the list has actually rendered it (§3.7 back-focus).
 *  The rows arrive with the paged query, not at mount, so this keys on `items` and gives up silently when
 *  the row isn't in the loaded window (a later page, or filtered out) — the surface container already holds
 *  focus in that case, which is the honest fallback, never a focus trap on nothing.
 *
 *  The row is located by the `ListRow` body's accessible NAME (the primitive takes no ref, and its
 *  `aria-label` IS the character name) inside the surface's own container — the scoped-querySelector
 *  precedent from `context-tabs-panel` / `settings-shell-surface`, never a document-wide reach. */
export function useRestoreRowFocus(surfaceRef: RefObject<HTMLDivElement | null>, focusCharacterId: CharacterId | null, items: readonly FocusableRow[]): void {
  const [pendingId, setPendingId] = useState<CharacterId | null>(focusCharacterId);
  useEffect(() => {
    if (pendingId === null) {
      return;
    }
    const name = items.find((item) => item.id === pendingId)?.name;
    if (name === undefined) {
      return;
    }
    // The row lands a FRAME after its data does — the flat list is virtualized, so the item's node appears
    // only once the virtualizer has measured. A bounded rAF poll (the settings-anchor precedent) waits for
    // it and then gives up silently rather than spinning.
    let frames = 0;
    let raf = 0;
    const attempt = (): void => {
      const row = surfaceRef.current?.querySelector<HTMLElement>(`[data-slot="list-row-body"][aria-label=${CSS.escape(name)}]`);
      if (row !== null && row !== undefined) {
        row.focus();
        setPendingId(null);
        return;
      }
      frames += 1;
      if (frames <= MAX_ROW_FOCUS_FRAMES) {
        raf = globalThis.requestAnimationFrame(attempt);
      }
    };
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-external-store-subscription -- no render state is derived here: this is a bounded rAF retry loop that IMPERATIVELY focuses a virtualized row once the virtualizer mounts it; the setPendingId(null) is the loop's own stop signal, not a mirror of an external store.
    attempt();
    return (): void => globalThis.cancelAnimationFrame(raf);
  }, [pendingId, items, surfaceRef]);
}
