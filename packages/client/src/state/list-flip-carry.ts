// THE LIST-FLIP CARRY SEAM (#391 — the injected half of staleness-free panel regime changes; the carry
// itself is `useShellLayout`'s `carryContextAcrossListFlip`, #383).
//
// WHY THIS IS AN INJECTED OP AND NOT A STORE ACTION. Docking or hiding the LIST can move CONTEXT between
// the TWO channels that carry its visibility — the ephemeral `openOverlayPanel` while it is an
// auto-overlay, the persisted `panelOverrides` dock while it is wide — so #383 made every list flip pay a
// carry that writes the destination channel. That carry cannot be computed here: it needs the active
// section's DEFINITION (`panels` + `panelDefaults`) and the shell's rendered content-primacy sentinel. The
// first is a React CONTEXT (`useSectionRegistry` — readable only during render), the second is app-shell's
// own ResizeObserver over a rendered sentinel. Neither is reachable from a module function.
//
// So the seam INVERTS: `useShellLayout` — the one place that already computes the carry, every commit —
// registers it here, and a writer outside the shell docks the LIST through `dockListPanel` instead of
// hand-writing `setPanelMode("list", …)` past it — going behind the carry is exactly the defect #391 names.
// The writer that paid for this seam was the character screen's "N chats ›" hero link
// (`revealChatsProjection`); #501 re-pointed that intent at the CONTEXT Chats tab, so the door currently has
// no production caller. It is KEPT, with its invariant pinned by CT (`tests/client/state/list-flip-carry.ct
// .tsx` at the store, `app-shell.ct.tsx` "#391" in the real frame): the rule is a property of the FLIP, and
// the next feature that docks the LIST must find a door that pays the carry rather than re-derive the bug.
//
// AN UNREGISTERED CARRY IS NOT A FAILURE MODE. No shell mounted ⇒ no rendered frame ⇒ no regime for a flip
// to move CONTEXT between, so the dock is simply the override write. That is why this is `?.()` rather
// than a guard with an error.
//
// THE CARRY IS CALLED FIRST TO MATCH `useShellLayout`'s OWN TWO SEAMS (`togglePanel` / `collapsePanel`
// both run the carry, then `setPanelMode`) — one shape for the same event, not two. It is deliberately NOT
// claimed as a proven invariant: the registered carry closes over the PREVIOUS COMMIT's resolved modes, so
// it sees the pre-flip world under either ordering, and a CT cannot tell the two apart through a
// render-value closure. Measured, not assumed — a planted write-first `dockListPanel` left
// `tests/client/state/list-flip-carry.ct.tsx` green, so that file pins what IS decidable (the carry is
// invoked, with the destination mode, from the pre-flip commit) and claims nothing about order.
//
// WHAT IS load-bearing is the CLOSURE'S AGE: the carry must be the one published by the commit BEFORE the
// flip, which is why `useShellLayout` re-registers on every commit rather than once on mount.

import type { PanelMode } from "./panel-resolve.ts";
import { setPanelMode } from "./shell-store.ts";

/** What `useShellLayout` registers: "the LIST is about to resolve `next` — write CONTEXT's destination
 *  channel". Takes the NEXT list mode because the carry's whole job is comparing the two regimes. */
export type ListFlipCarry = (nextListMode: PanelMode) => void;

let listFlipCarry: ListFlipCarry | null = null;

/** Publish (or, with `null`, retire) the mounted shell's carry. Called only by `useShellLayout`. */
export function registerListFlipCarry(carry: ListFlipCarry | null): void {
  listFlipCarry = carry;
}

/** Dock the active section's LIST pane from OUTSIDE the shell. Identical to what the topbar's list toggle
 *  does: carry CONTEXT across the regime flip this dock causes, THEN write the override. */
export function dockListPanel(): void {
  listFlipCarry?.("docked");
  setPanelMode("list", "docked");
}
