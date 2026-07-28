// The Inventory "last change" EPHEMERAL diff (panel-redesign DESIGN.md §12.2.8): the design's "last change
// — dart bagged" line has NO backing datum (no per-item turn ref; views don't diff), so the honest arm is
// a CLIENT-SIDE ephemeral diff — compare the previous vs the new inventory as the tracker view re-renders
// and surface the delta ("dart ×1 added" / "poultice vial ×2 removed"). No TurnRef (the diff has no message
// anchor); cleared on reload (it lives only in component state — a fresh mount starts with no baseline).
//
// The compare runs during render via the derived-state pattern (a `useState` snapshot of the previous
// inventory + a re-derive when it changes) — NOT a ref read/write in render (the react-hooks/refs render
// ban) and NOT a setState-in-effect. The FIRST render establishes the baseline silently (no phantom "added
// everything" line on open).

import type { RpgInventoryItem } from "@orb/contracts/rpg";
import { useState } from "react";

/** A stable signature of the inventory (id → qty) — the compare key; a change in any item's presence or
 *  quantity re-derives the delta. */
function signature(items: readonly RpgInventoryItem[]): string {
  return items
    .map((i) => `${i.id}:${i.quantity}`)
    .sort()
    .join(",");
}

/** An ADD (an id in `next` not in `prev`) → its line, or null. */
function firstAdd(prevById: ReadonlyMap<string, RpgInventoryItem>, next: readonly RpgInventoryItem[]): string | null {
  for (const item of next) {
    if (!prevById.has(item.id)) {
      return `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ""} added`;
    }
  }
  return null;
}

/** A QUANTITY delta on a surviving item → its `±n` line, or null. */
function firstQtyChange(prevById: ReadonlyMap<string, RpgInventoryItem>, next: readonly RpgInventoryItem[]): string | null {
  for (const item of next) {
    const before = prevById.get(item.id);
    if (before !== undefined && before.quantity !== item.quantity) {
      const diff = item.quantity - before.quantity;
      return `${item.name} ${diff > 0 ? `+${diff}` : diff}`;
    }
  }
  return null;
}

/** A REMOVE (an id in `prev` gone from `next`) → its line, or null. */
function firstRemove(prev: readonly RpgInventoryItem[], nextById: ReadonlyMap<string, RpgInventoryItem>): string | null {
  for (const item of prev) {
    if (!nextById.has(item.id)) {
      return `${item.name} removed`;
    }
  }
  return null;
}

/** The most-significant single change between two inventories, as a human line — or null when nothing
 *  material changed. Prefers an ADD, then a quantity change, then a REMOVE (§12.2.8 "last change"). */
function describeDelta(prev: readonly RpgInventoryItem[], next: readonly RpgInventoryItem[]): string | null {
  const prevById = new Map(prev.map((i) => [i.id, i]));
  const nextById = new Map(next.map((i) => [i.id, i]));
  return firstAdd(prevById, next) ?? firstQtyChange(prevById, next) ?? firstRemove(prev, nextById);
}

/** The ephemeral "last change" line for the given inventory, or null. Baseline-silent on first observation;
 *  updates as the inventory changes under the panel; cleared on reload (state-only). */
export function useInventoryDiff(items: readonly RpgInventoryItem[]): string | null {
  const sig = signature(items);
  // The previous observation: `{ sig, items }` (the baseline) + the last-computed line. Derived-state
  // pattern — recompute when the signature changes (never a ref read/write in render).
  const [prev, setPrev] = useState<{ readonly sig: string; readonly items: readonly RpgInventoryItem[]; readonly line: string | null }>({
    sig,
    items,
    line: null,
  });
  if (sig !== prev.sig) {
    setPrev({ sig, items, line: describeDelta(prev.items, items) });
  }
  return sig === prev.sig ? prev.line : describeDelta(prev.items, items);
}
