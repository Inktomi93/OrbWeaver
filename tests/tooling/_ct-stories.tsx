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

/** The LOCATABILITY stage: two elements carrying the SAME `data-slot` — the shape every shadcn-style
 *  primitive produces (`data-slot` names a component KIND, not an identity, and a real surface renders
 *  dozens of `[data-slot=text]`). A finding that reports only the slot names all of them and locates none. */
export function WalkerDuplicateSlotStory(): ReactElement {
  return (
    <div data-testid="slot-stage" style={{ padding: 24, width: 320 }}>
      <section>
        <span data-slot="text">left copy</span>
      </section>
      <section>
        <span data-slot="text">right copy</span>
      </section>
    </div>
  );
}

/** The RATIFIED KICKER stage: the micro-caps section-label voice (tokens `text.micro` + `tracking.micro`
 *  0.08em + weight 600 + caps, density spec §2.3) authored two ways — `text-transform: uppercase`, and
 *  LITERAL uppercase characters, which render identically. Below them, the genuine defect the tracking rule
 *  exists for: sentence-case running text at the same 0.08em. */
export function WalkerCapsTrackingStory(): ReactElement {
  const kicker = { fontSize: 10.5, letterSpacing: "0.08em", fontWeight: 600 } as const;
  return (
    <div style={{ padding: 24, width: 480 }}>
      <span data-testid="kicker-transformed" style={{ ...kicker, textTransform: "uppercase" }}>
        Pick up where you left off
      </span>
      <span data-testid="kicker-literal" style={kicker}>
        PICK UP WHERE YOU LEFT OFF
      </span>
      <p data-testid="tracked-prose" style={{ fontSize: 15, letterSpacing: "0.08em" }}>
        This is ordinary running prose set with label tracking, which is exactly the defect the rule exists to catch.
      </p>
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
