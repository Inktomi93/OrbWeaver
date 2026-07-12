// reorder-move — recover the single array move a completed drag produced. @dnd-kit's `onReorder` hands us
// the already-reordered key array; `form.moveFieldValues("sections", from, to)` needs the (from → to) pair
// of the equivalent `arrayMove`. Both @dnd-kit and TanStack use identical splice-out/splice-in semantics,
// so recovering the exact pair reproduces the visible order in the form array. A naive "first divergence →
// indexOf" diff is only correct for ±1-slot drags (it silently writes the wrong order for any longer move),
// so this is a real, tested function, not an inline one-liner.

// A section-id key — structurally identical to @orb/ui/sortable's `SortableItemKey`, declared locally so
// this node-safe lib never deep-imports the DOM-touching sortable barrel (which would drag `matchMedia`
// into the DOM-less type graph and red the shared type-gate). Same trick sortable.tsx uses for its export.
type SortableItemKey = string | number;

/** Recover the single `(from → to)` `arrayMove` that maps `before` to `after`. A one-element move leaves
 *  `before` and `after` identical outside a window `[lo, hi]`; because section ids are unique, the moved id
 *  sits at `lo` in `before` and `hi` in `after` when the drag went DOWN (`lo → hi`), and at `hi`/`lo`
 *  respectively when it went UP (`hi → lo`). Adjacent swaps collapse to the same resulting array from either
 *  end, so the tie is harmless. Returns `null` for a canceled/no-op drag (nothing diverged). */
export function diffMove(
  before: readonly SortableItemKey[],
  after: readonly SortableItemKey[],
): { from: number; to: number } | null {
  const lo = before.findIndex((key, i) => key !== after[i]);
  if (lo === -1) {
    return null;
  }
  let hi = before.length - 1;
  while (hi > lo && before[hi] === after[hi]) {
    hi--;
  }
  return before[lo] === after[hi] ? { from: lo, to: hi } : { from: hi, to: lo };
}
