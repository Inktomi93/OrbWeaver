// CT stories for the @orb/ui chart family (core/Spine-Testing.md §7 — a CT mounts from a non-test module).
//
// WHY THESE EXIST AT ALL (measured 2026-08-19, lane analytics-charts): playwright-ct SERIALIZES the mounted
// JSX tree across its RPC boundary, and a FUNCTION prop on a component nested inside that tree does not
// survive it. A `valueFormatter` passed as `<div style={…}><BarList valueFormatter={fn} /></div>` arrives
// UNDEFINED, and the canvas quietly draws the DEFAULT `String(value)` label — a green-looking test asserting
// a chart nobody composes. Every chart defect that lives in a formatter (a clipped value label) or in a
// production-narrow host box therefore needs its formatter and its host box owned HERE, in real module code.
//
// Components only — playwright-ct rewrites this module's named imports into generated component consts, so
// a mixed import (component + constant) fails to parse in the consuming CT.
import { BarList } from "@orb/ui/bar-list";
import type { ReactElement } from "react";

/** A momentum column at its production floor: `MomentumColumn` is `min-w-48` (192px) inside a wrapping Row,
 *  so ~240px is the width the owner's two-column Momentum band actually renders at on a laptop. */
const NARROW_HOST_PX = 240;

/** `formatSignedDelta`'s shape (the analytics view-model) — the sign lives ONLY in this label. */
function signedDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** A wide bar-end label: the token counts the Models tab formats, at the width they actually take. */
function tokenCount(value: number): string {
  return `${value} tokens`;
}

/**
 * P1c — BOTH clipping faces in one production-shaped chart: a long character name on the y-axis and a real
 * bar-end value label, at the width a momentum column actually gets.
 *
 * Measured at HEAD (band 0.2–0.33 of the canvas): the name was cut off mid-word at x=0, the plot was 22px
 * of 240, and the value label ran off the right edge (last ink column 239 of 240) — "100 tokens" painted as
 * "100 to". The two faces share one cause: ECharts budgets AXIS labels only, and truncates nothing.
 */
export function ClippedValueLabelStory(): ReactElement {
  return (
    <div style={{ width: NARROW_HOST_PX }}>
      <BarList
        items={[
          { id: "a", label: "Morgatha of the Seven Winding Vales", value: 100 },
          { id: "b", label: "Imai", value: 40 },
        ]}
        label="Generations by model"
        valueFormatter={tokenCount}
      />
    </div>
  );
}

/** P1e — a SHORT series: the text equivalent must be there at every length, not only where it is large. */
export function ShortSeriesBarListStory(): ReactElement {
  return (
    <BarList
      items={[
        { id: "a", label: "Morgatha", value: 10 },
        { id: "b", label: "Kate", value: 8 },
        { id: "c", label: "Imai", value: 3 },
      ]}
      label="Rising"
      valueFormatter={signedDelta}
    />
  );
}

/** P1e — a LONG series: 20 rows, where a navigable table is the ONLY usable form of the reading. */
export function LongSeriesBarListStory(): ReactElement {
  return (
    <BarList
      items={Array.from({ length: 20 }, (_unused, index) => ({ id: `m${index}`, label: `Model ${index}`, value: 100 - index * 3 }))}
      label="Generations by model"
      valueFormatter={tokenCount}
    />
  );
}
