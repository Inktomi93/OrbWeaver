// SeriesRow — one data-series line: colour swatch · label (+ optional detail) · value. The TEXT twin of a
// stacked/segmented chart's segment (mirrors the mock's `.prow`): the swatch keys the row to its
// segment, and the row carries the accessible datum the (aria-hidden) bar deliberately does not.
//
// PHRASING CONTENT ONLY — every part is a `<span>`, so the whole row is legal INSIDE an interactive parent
// (`<CollapsibleTrigger>`, a `<button>` list row). That is the point: the drill-in affordance is the caller's
// (Collapsible bakes its own rotating chevron), so this component renders NO control of its own — nesting one
// would be invalid inside the trigger it is designed to live in. Compare `ListRow`, which owns its button.
//
// The swatch is DECORATION (`aria-hidden`): colour is never the meaning here, the label is.
import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { seriesRowVariants } from "./variants.ts";

/** Which `--color-track-N` ramp step the swatch shows — the SAME categorical ramp the segmented bar tints its
 *  segments with, so a row and its segment read as one pair. Structurally identical to `@orb/ui/meter`'s
 *  `TrackColor` (ui-local, not imported across the group boundary). */
export type SeriesColor = 1 | 2 | 3 | 4 | 5 | 6;

export interface SeriesRowProps extends Omit<ComponentProps<"span">, "children" | "color">, VariantProps<typeof seriesRowVariants> {
  /** The series name — the row's datum, never truncated away from a title tooltip. */
  label: string;
  /** Pre-formatted trailing value ("1,208", "42%"). A string: ui does no Intl/number formatting. */
  value: string;
  /** Optional secondary line under the label (the contributors, the shape — "41 turns · 3 dropped").
   *  `| undefined` is explicit so a caller may pass a computed `string | undefined` under
   *  `exactOptionalPropertyTypes` without a conditional-spread dance. */
  detail?: string | undefined;
  /** The swatch's ramp step. Omit ⇒ no swatch (a row that isn't keyed to a segment). */
  color?: SeriesColor | undefined;
}

/** The 6-step ramp as literal BACKGROUND utilities — Tailwind must see each class whole, so a runtime index
 *  maps through a static Record (the `TRACK_FILL` precedent in charts/meter). */
const SWATCH_FILL: Record<SeriesColor, string> = {
  1: "bg-track-1",
  2: "bg-track-2",
  3: "bg-track-3",
  4: "bg-track-4",
  5: "bg-track-5",
  6: "bg-track-6",
};

export function SeriesRow({ label, value, detail, color, divider, className, ...rest }: SeriesRowProps): ReactElement {
  const slots = seriesRowVariants({ divider });
  return (
    <span {...rest} className={cn(slots.root(), className)} data-slot="series-row">
      {color === undefined ? null : <span aria-hidden={true} className={cn(slots.swatch(), SWATCH_FILL[color])} data-slot="series-row-swatch" />}
      <span className={slots.content()} data-slot="series-row-content">
        <span className={slots.label()} data-slot="series-row-label" title={label}>
          {label}
        </span>
        {detail === undefined ? null : (
          <span className={slots.detail()} data-slot="series-row-detail" title={detail}>
            {detail}
          </span>
        )}
      </span>
      <span className={slots.value()} data-slot="series-row-value">
        {value}
      </span>
    </span>
  );
}
