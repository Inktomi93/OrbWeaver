// createKindedSelectionStore — the MIXED-KIND arm of the drill-selection mint (review F-7): ONE selection
// across N sibling collections in one pane, as a (kind, member) PAIR. Its own file because `state-files`
// allows exactly ONE store-minting call per module, and because the two shapes have nothing to share but
// the door: a `P extends string` primary cannot express a kind axis without string-packing, which is the
// stringly state the house style rejects.
//
// It is NOT an overload on `createDrillSelectionStore` (which is what the review sketched): an
// implementation signature returning `DrillSelectionStore<P,S> | KindedDrillStore` is not assignable to the
// narrow overload (TS2394), and the only ways to force it are a cast through the union or a lie about the
// return type. The seam that matters is unchanged — one `createGatedStore` door, one action-label grammar,
// the same LIST dual-write — and G27's `selection-store-via-factory` seal still holds, since a
// `state/*-selection-store.ts` calls THIS mint and never the raw door.

import { createGatedStore } from "./create-gated-store.ts";
import type { SectionSelection } from "./section-registry.ts";
import { setOpenOverlayPanel } from "./shell-store.ts";

/** A MIXED-KIND selection: which collection the member belongs to, and which member (review F-7). Both
 *  halves are opaque strings — the kind axis is host-opaque by design (no closed tuple to gate), and the
 *  member id is re-branded at the owner's edge, the same trade `P extends string` already makes. */
export interface KindedSelection {
  readonly kind: string;
  readonly memberId: string;
}

/** A drill store whose primary is a (kind, member) PAIR — one selection across N sibling collections in one
 *  pane, which a `P extends string` primary can only express by string-packing. */
export interface KindedDrillStore {
  /** Reactive: the selected pair (`null` = the section's welcome home). One state field, one object
   *  identity — a primitive-shaped selector, no fresh object per render. */
  readonly useSelection: () => KindedSelection | null;
  readonly select: (kind: string, memberId: string) => void;
  /** Clear the selection — back to the section's welcome home, AND release any open LIST slide-over (the
   *  drill-store twin: ONE DOOR BACK, side-eye P2). */
  readonly clear: () => void;
  /** `select` AND close any open LIST slide-over (viewport-unaware; a no-op when the LIST is docked). */
  readonly selectFromList: (kind: string, memberId: string) => void;
  /** The section-registry SEAM over this store (`SectionSelection`) — the drill-store twin: how the SHELL
   *  asks "is a member open here?" for the mobile ONE-SHELL rule, and how its back affordance clears it. */
  readonly selection: SectionSelection;
}

interface KindedSelectionState {
  readonly selection: KindedSelection | null;
}

/** Mint one kinded selection store (the file header carries the why). */
export function createKindedSelectionStore(name: string): KindedDrillStore {
  const useSelectionStore = createGatedStore<KindedSelectionState>(name, (): KindedSelectionState => ({ selection: null }));
  const write = (kind: string, memberId: string): void => useSelectionStore.setState({ selection: { kind, memberId } }, false, `${name}/select`);
  // The ONE clear — see `clear`'s contract (the drill-store twin).
  const clearSelection = (): void => {
    useSelectionStore.setState({ selection: null }, false, `${name}/clear`);
    setOpenOverlayPanel(null);
  };
  return {
    useSelection: (): KindedSelection | null => useSelectionStore((s) => s.selection),
    select: write,
    clear: clearSelection,
    selectFromList: (kind: string, memberId: string): void => {
      write(kind, memberId);
      setOpenOverlayPanel(null);
    },
    selection: {
      subscribe: (onStoreChange: () => void): (() => void) => useSelectionStore.subscribe(onStoreChange),
      hasSelection: (): boolean => useSelectionStore.getState().selection !== null,
      // THE SAME function the store exports — one door, by construction.
      clear: clearSelection,
    },
  };
}
