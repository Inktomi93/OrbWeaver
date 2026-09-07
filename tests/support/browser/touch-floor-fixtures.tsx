// Story module for touch-floor.ct.tsx (Spine-Testing §7 — a CT mounts ONLY from a non-test module).
// Both stages exist to reproduce the #662 defect class directly through the CT kit itself: an
// ancestor-credit clause that made a box-carried control alone in a padded wrapper structurally
// un-failable, plus the pseudo-carried shape the same clause exists to serve. Imports go through the
// SAME `@orb/ui/*` aliases the CT providers use — a relative path into packages/ui would resolve a
// second module instance and mount blank.

import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";

/** The BOX-CARRIED regression stage: a plain, undersized, non-pseudo button ALONE in a huge, STATIC
 *  padded wrapper — no `after:`/`before:` classes, no min-height/min-width, so its floor is its own
 *  16x16 border box. Before the fix, `hitExtent`'s unconditional ancestor credit walked out to the
 *  wrapper at every probed step and measured 80 steps (the sweep's own ceiling) no matter how small the
 *  button's real box was. Isolated deliberately: a sibling within the reach would make the OLD code fail
 *  too, masking the defect. Inset from the left edge because `elementFromPoint` never resolves a
 *  negative viewport coordinate, so a control flush against x=0 would fail its own left probe at every
 *  radius regardless of the fix under test. */
export function TouchFloorBoxCarriedIsolatedStory(): ReactElement {
  return (
    <div style={{ padding: 120, position: "static", width: 400 }}>
      <button data-testid="box-carried-isolated" style={{ display: "block", height: 16, marginInlineStart: 48, padding: 0, width: 16 }} type="button">
        x
      </button>
    </div>
  );
}

/** The PSEUDO-CARRIED companion: the ancestor-credit clause's MINTED purpose must still pass after the
 *  fix. A glyph-sm Button's visible box is far under the coarse floor, and the floor is carried entirely
 *  by its overflowing `::after` (`after:size-touch-target`, `after:absolute`) — no DOM node of its own,
 *  so the outward sweep legitimately falls through to the wrapper at the pseudo's clipped edge. Isolated
 *  and inset from x=0 for the same reasons as the box-carried stage above. */
export function TouchFloorPseudoCarriedIsolatedStory(): ReactElement {
  return (
    <div style={{ padding: 120, position: "static", width: 400 }}>
      <div style={{ marginInlineStart: 48 }}>
        <Button aria-label="Regenerate" data-testid="pseudo-carried-isolated" size="glyph-sm" />
      </div>
    </div>
  );
}
