// The elevation PICKER as ILLUSTRATED CELLS (#866 §7.8, owner rulings 2026-08-30 — the
// preview-vs-illustration distinction, then the exaggeration refinement): elevation's meaning is
// structural ("the hairlines vanish together across the chrome horizon" — shell.css's own words), so a
// faithful mini-PREVIEW is impossible (a nested box has no seams to lose) — but the DIFFERENCE between
// the options is depictable, and the diagram is ALLOWED TO EXAGGERATE it: at diagram size a truthful
// 1px seam shows nothing, and an under-drawn honest diagram teaches nothing (the actual failure mode).
// The KIND of difference stays honest — flat = seams, ramp = a seamless brightness ladder, glow =
// floating islands — while the AMOUNT is scaled for instant reading.
//
// THE LADDER IS AN EXAGGERATION OF THE RAMP, NOT THE RAMP ITSELF (#1099 G4, and the ramp-neighbour
// ceiling). `Layered` used to paint `bg-sidebar` / `bg-surface-raised` / `bg-card` — the shell's REAL
// three tones — and the settled measurement found every descendant at `rgba(0,0,0,0)` with the three
// steps 1.03–1.12:1 apart where they did paint: the middle option of a three-option picker was a picture
// of nothing. Two adjacent members of the derived neutral ramp are ~0.05 apart in OKLCH L BY CONSTRUCTION
// (`ramp-neighbour-contrast-ceiling` — ~1.14:1 on either polarity), so the G4 receipt of ≥1.5:1 per step
// is physically unreachable from ramp neighbours: no amount of token-swapping gets there, which is
// precisely the case §7.8's exaggeration licence exists for. The ladder is now `foreground` alpha over
// the base surface — DERIVED from the two tokens whose relationship IS "how far apart can two surfaces
// read", polarity-correct in both themes for free, and steppable to a legible distance. Flat and Lifted
// keep painting the shell's own tones; only the amount of the ramp step is scaled.
//
// Every colour, hairline and shadow is still DERIVED from the SAME tokens the shell rules consume
// (`bg-background` / `bg-sidebar` / `border-border` / `shadow-overlay`) — theme-correct for free, and a
// token change moves the diagram. The map is TOTAL over the option union: a new elevation member fails
// tsc here until it says what it looks like (the teach-declaration posture). Labels ride
// `ELEVATION_ITEMS`, the one option table; the write path is the same bound field the Select drove.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { Row, Stack } from "@orb/ui/layout";
import { RadioGroupPicker, RadioGroupPickerItem } from "@orb/ui/radio-group";
import type { ReactElement } from "react";
import { useId } from "react";
import { ELEVATION_ITEMS } from "../lib/appearance-select-items.ts";

type Elevation = AppearanceSettings["elevation"];

// THE FRAME IS SPELLED INLINE IN ALL THREE, deliberately. Hoisting it to a shared `const PLATE` string
// makes the classes invisible to every literal-shape gate that reads this file — `density-tier`
// immediately reported the GLOW diagram's RATIFIED nested-island rows as gone (its ratchet's "budgets 2
// finding(s) … but only 0 remain" arm), which is a gate being blinded, not a violation being fixed.

/** FLAT — separation BY LINE: one base tone across the whole horizon with the `--color-sidebar-border`
 *  seams KEPT. EXAGGERATED: 2px seams — a truthful hairline reads as nothing at this size. */
function FlatDiagram(): ReactElement {
  return (
    <Row className="h-10 w-full overflow-hidden rounded-control border border-border bg-sidebar">
      <Row className="flex-1" />
      <Row className="flex-1 border-sidebar-border border-l-2" />
      <Row className="flex-[2] border-sidebar-border border-l-2" />
    </Row>
  );
}

/** LAYERED — separation BY SHADE STEP, not merely a removed line: every seam comes off AND the surfaces
 *  climb a brightness ladder. The steps are `foreground` at rising alpha over the base, which is the
 *  exaggeration: the shipped ramp's real neighbours cannot read apart at diagram size (see the header).
 *  The three alphas are sized against the RECEIPT, not by eye — composited over the shipped bases they
 *  step 2.08:1 / 2.30:1 on the dark polarity and 1.67:1 / 2.21:1 on the light one, both clear of G4's
 *  1.5:1 floor. The CT re-measures them from the rendered pixels rather than trusting this line. */
function RampDiagram(): ReactElement {
  return (
    <Row className="h-10 w-full overflow-hidden rounded-control border border-border bg-background">
      <Row className="flex-1 bg-foreground/8" />
      <Row className="flex-1 bg-foreground/32" />
      <Row className="flex-[2] bg-foreground/60" />
    </Row>
  );
}

/** LIFTED (GLOW) — separation BY LINE + LIFT: flat's seams STAY (shell.css keeps them under glow) and the
 *  surfaces additionally float on the shell's own `shadow-overlay`. EXAGGERATED: visible air and a
 *  shorter card make the lift read instantly; the hairline on each island keeps the LINE half true. */
function GlowDiagram(): ReactElement {
  return (
    <Row className="h-10 w-full items-center gap-row overflow-hidden rounded-control border border-border bg-background p-row">
      <Row className="h-3/4 flex-1 rounded-inset border border-sidebar-border bg-sidebar shadow-overlay" />
      <Row className="h-3/4 flex-[2] rounded-inset border border-sidebar-border bg-card shadow-overlay" />
    </Row>
  );
}

/** TOTAL over the union — a new elevation member is a tsc error here until it is depicted. */
const ELEVATION_DIAGRAMS: Record<Elevation, () => ReactElement> = {
  flat: FlatDiagram,
  ramp: RampDiagram,
  glow: GlowDiagram,
};

export interface ElevationCardsProps {
  readonly value: Elevation;
  readonly onPick: (value: Elevation) => void;
}

/** The illustrated option grid — ONE radiogroup (one tab stop, roving focus, arrows change selection,
 *  #981 F20) in the shared picker-cell anatomy; the diagram is the cell's art, the label is the words. */
export function ElevationCards({ value, onPick }: ElevationCardsProps): ReactElement {
  const ids = useId();
  return (
    <RadioGroupPicker aria-label="Surface elevation" data-slot="elevation-cards" onValueChange={(next): void => onPick(next as Elevation)} value={value}>
      {ELEVATION_ITEMS.map((item) => {
        const Diagram = ELEVATION_DIAGRAMS[item.value];
        return (
          <RadioGroupPickerItem
            key={item.value}
            art={
              <Stack className="h-full w-full justify-center p-tight">
                <Diagram />
              </Stack>
            }
            idPrefix={`${ids}-${item.value}`}
            label={item.label}
            value={item.value}
          />
        );
      })}
    </RadioGroupPicker>
  );
}
