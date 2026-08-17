// Story module for the tooling-tier CTs (Spine-Testing §7 — a CT mounts ONLY from a non-test module).
// These stages exist for design-audit-walker.ct.tsx, which runs the REAL in-page fact walker
// (scripts/probes/design-audit-walker.ts) over them: the walker is a raw JS string evaluated in a page,
// so a browser is the only tier that can prove its hit-area arithmetic at all.
// Imports go through the SAME `@orb/ui/*` aliases the CT providers use — a relative path into
// packages/ui would resolve a second module instance and mount blank.

import { Slider } from "@orb/ui/slider";
import type { ReactElement } from "react";

/** The composite stage: ONE control (a Base UI Slider) whose pointer target is the whole `h-control-sm`
 *  row, while the outward hit probe lands on `[data-slot=slider-indicator]` — a SIBLING of the thumb. The
 *  host is a fixed width so the row's geometry is the production one, not a content-sized shrink. */
export function WalkerSliderCompositeStory(): ReactElement {
  return (
    <div style={{ width: 320, padding: 24 }}>
      <Slider aria-label="Composite slider" defaultValue={50} />
    </div>
  );
}

/** The control stage: two GENUINE neighbours — separate small buttons sharing a row. The widened
 *  ownership rule must NOT credit either one with the other's space; both stay sub-target. */
export function WalkerNeighbourButtonsStory(): ReactElement {
  return (
    <div style={{ display: "flex", gap: 4, padding: 24, width: 320 }}>
      <button data-testid="neighbour-a" style={{ height: 20, width: 20 }} type="button">
        A
      </button>
      <button data-testid="neighbour-b" style={{ height: 20, width: 20 }} type="button">
        B
      </button>
    </div>
  );
}
