// The elevation PICKER as ILLUSTRATED CARDS (#866 §7.8, owner rulings 2026-08-30 — the
// preview-vs-illustration distinction, then the exaggeration refinement): elevation's meaning is
// structural ("the hairlines vanish together across the chrome horizon" — shell.css's own words), so a
// faithful mini-PREVIEW is impossible (a nested box has no seams to lose) — but the DIFFERENCE between
// the options is depictable, and the diagram is ALLOWED TO EXAGGERATE it: at diagram size a truthful
// 1px seam shows nothing, and an under-drawn honest diagram teaches nothing (the actual failure mode).
// The KIND of difference stays honest — flat = seams, ramp = a seamless brightness ladder, glow =
// floating islands — while the AMOUNT is scaled for instant reading (thick seams, a real drop). Every
// colour, hairline and shadow is DERIVED from the SAME tokens the shell rules consume
// (`bg-background` / `bg-surface-raised` / `bg-card` / `border-border` / `shadow-overlay`) —
// theme-correct for free, and a token change moves the diagram. The map is TOTAL over the option
// union: a new elevation member fails tsc here until it says what it looks like (the teach-declaration
// posture). Labels ride `ELEVATION_ITEMS`, the one option table; the write path is the same bound
// field the Select drove.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { ELEVATION_ITEMS } from "../lib/appearance-select-items.ts";

type Elevation = AppearanceSettings["elevation"];

/** FLAT — one tone, the seams KEPT. EXAGGERATED: 2px seams (a truthful hairline reads as nothing at
 *  this size); the seam COLOUR stays the shell's own border token. */
function FlatDiagram(): ReactElement {
  return (
    <Row className="h-10 overflow-hidden rounded-control border border-border bg-background">
      <Row className="flex-1" />
      <Row className="flex-1 border-border border-l-2" />
      <Row className="flex-[2] border-border border-l-2" />
    </Row>
  );
}

/** RAMP — the brightness ladder, the seams GONE: rail darkest, panel lifts, content lifts again. The
 *  cells sit edge to edge with NO separators at all — the seamlessness IS the depiction. */
function RampDiagram(): ReactElement {
  return (
    <Row className="h-10 overflow-hidden rounded-control border border-border">
      <Row className="flex-1 bg-background" />
      <Row className="flex-1 bg-surface-raised" />
      <Row className="flex-[2] bg-card" />
    </Row>
  );
}

/** GLOW — floating islands. EXAGGERATED: the cards sit visibly OFF the base (generous air, a shorter
 *  card, the shell's own `shadow-overlay` doing the lift) so the float reads instantly. */
function GlowDiagram(): ReactElement {
  return (
    <Row className="h-10 items-center gap-row rounded-control border border-border bg-background p-row">
      <Row className="h-3/4 flex-1 rounded-inset bg-card shadow-overlay" />
      <Row className="h-3/4 flex-[2] rounded-inset bg-card shadow-overlay" />
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

/** The illustrated option row — the ChatStyleCards grammar (aria-pressed buttons named by the option
 *  table; the diagram is ornament, the label is the words). */
export function ElevationCards({ value, onPick }: ElevationCardsProps): ReactElement {
  return (
    <Row className="flex-wrap" gap="row" data-slot="elevation-cards">
      {ELEVATION_ITEMS.map((item) => {
        const elevation = item.value;
        const Diagram = ELEVATION_DIAGRAMS[elevation];
        const selected = elevation === value;
        return (
          <Button
            key={item.value}
            aria-label={item.label}
            aria-pressed={selected}
            className={
              selected
                ? "h-auto min-w-32 flex-1 basis-1/4 flex-col items-stretch gap-field p-field ring-2 ring-ring"
                : "h-auto min-w-32 flex-1 basis-1/4 flex-col items-stretch gap-field p-field"
            }
            intent="outline"
            onClick={(): void => onPick(elevation)}
          >
            <Stack aria-hidden={true} className="pointer-events-none select-none">
              <Diagram />
            </Stack>
            <Text as="span" voice="label" className="truncate">
              {item.label}
            </Text>
          </Button>
        );
      })}
    </Row>
  );
}
