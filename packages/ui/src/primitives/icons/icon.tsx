// Lucide components take a `size` NUMBER prop, so icon sizes are named px consts pinned to the
// type-scale tokens below instead of raw/arbitrary Tailwind classes. The token linkage IS this table.
//
// The three appearance axes ride lucide-react 1.22.0's OWN surface wherever it has one and hand-build
// only what it genuinely lacks (verified against the shipped dist, not memory — §13.8 R1):
//   weight      → `strokeWidth` + `absoluteStrokeWidth` (dist/esm/Icon.mjs computes
//                 `strokeWidth * 24 / size`, so the px weight is size-independent).
//   fill=solid  → the plain SVG `fill` pass-through. lucide's own recipe; note the library states
//                 "Fills are officially not supported … will work fine on certain icons"
//                 (https://lucide.dev/guide/react/advanced/filled-icons) — which is exactly why the
//                 axis only accepts a `FillableIcon` (./fillable).
//   partialFill → NOT a lucide capability at any version: its documented half-fill recipe is a
//                 per-icon `StarHalf` glyph absolutely positioned over a `Star` (same page). We draw
//                 it generically instead — a hard-stop <linearGradient> handed to lucide through its
//                 documented CHILDREN slot (https://lucide.dev/guide/react/advanced/combining-icons —
//                 children render inside the icon's own <svg>), so it works for EVERY glyph by
//                 construction: no per-icon minting, no second render, no wrapper element.
import type { LucideIcon } from "lucide-react";
import type { ReactElement } from "react";
import { useId } from "react";
import type { FillableIcon } from "./fillable";

/** 12px — pairs with `--text-label`; sub-`sm` indicator marks (checkbox/select/number-field glyphs). */
export const ICON_XS = 12;
/** 16px — pairs with `--text-title` (1rem) body-adjacent chrome. */
export const ICON_SM = 16;
/** 20px — pairs with `--text-headline` (1.25rem); the default control icon. */
export const ICON_MD = 20;
/** 24px — pairs with `--text-display` (1.5rem) hero/empty-state glyphs. */
export const ICON_LG = 24;

const ICON_SIZES = { xs: ICON_XS, sm: ICON_SM, md: ICON_MD, lg: ICON_LG } as const;

/** The house line-weight table (owner taste dial). `regular` is the app-wide default; every arm is
 *  paired with lucide's `absoluteStrokeWidth` so the stroke is a CONSTANT px width across every icon
 *  size — an `xs` glyph and an `lg` glyph read at the same weight (without it lucide scales the
 *  stroke with the box, so small icons look heavier). Named arms, never a raw number from a caller:
 *  a weight is a design decision with three legal answers, not a free float. */
const ICON_WEIGHTS = { hairline: 1, regular: 1.75, bold: 2.5 } as const;

/** `useId`'s format is React-version-dependent and has shipped id-illegal characters before (React 18
 *  emitted `:r0:`; 19.2 emits `_R_0_`). Strip anything not id-legal so `url(#…)` keeps resolving
 *  across a React bump — the fragment reference is the only thing holding the partial fill together. */
const ID_UNSAFE = /[^a-zA-Z0-9_-]/g;

const NO_FILL = 0;
const FULL_FILL = 1;

interface IconBaseProps {
  size?: keyof typeof ICON_SIZES;
  /** Named stroke weight; `absoluteStrokeWidth` makes it OPTICAL (constant px), not size-relative. */
  weight?: keyof typeof ICON_WEIGHTS;
  /** Accessible name. Omitted = decorative (`aria-hidden`), the default for icons beside text. */
  label?: string;
  className?: string;
}

/**
 * Props for {@link Icon}. The fill axes are gated at the TYPE level: they only exist on the arm whose
 * `icon` is a {@link FillableIcon} (the branded, evidence-checked subset in `./fillable`), so pairing
 * `fill="solid"` with a multi-path outline is a compile error rather than an ugly render.
 *
 * **A fill NEVER carries information alone** (the tracker-kit rule: the TEXT is the datum). Icons stay
 * decorative/`aria-hidden` unless `label` is set, and a `partialFill` fraction is decoration for a
 * value that is also rendered as text or exposed on the owning control's ARIA.
 */
export type IconProps = IconBaseProps &
  (
    | {
        icon: FillableIcon;
        /** `solid` paints the glyph's closed subpaths with `currentColor` (shape delta, not a color-only state). */
        fill?: "none" | "solid";
        /** 0..1 fraction filled left→right (half-star / meter-coin class). Wins over `fill` when set. */
        partialFill?: number;
      }
    | { icon: LucideIcon; fill?: "none"; partialFill?: never }
  );

function clampFraction(value: number): number {
  return Math.min(FULL_FILL, Math.max(NO_FILL, value));
}

/** Sizing wrapper for the curated lucide set — decorative by default; constant house stroke weight;
 *  optional solid / fractional fill on the `FillableIcon` subset. */
export function Icon({ icon: Glyph, size = "md", weight = "regular", fill = "none", partialFill, label, className }: IconProps): ReactElement {
  const instanceId = useId().replace(ID_UNSAFE, "");
  const fraction = clampFraction(partialFill ?? (fill === "solid" ? FULL_FILL : NO_FILL));
  const gradientId = `orb-icon-fill-${instanceId}`;
  const isPartial = fraction > NO_FILL && fraction < FULL_FILL;
  return (
    <Glyph
      size={ICON_SIZES[size]}
      absoluteStrokeWidth={true}
      strokeWidth={ICON_WEIGHTS[weight]}
      aria-hidden={label === undefined}
      aria-label={label}
      className={className}
      {...(fraction === NO_FILL ? {} : { fill: isPartial ? `url(#${gradientId})` : "currentColor" })}
    >
      {isPartial ? (
        <defs key="orb-icon-partial-fill">
          {/* objectBoundingBox units (the default): the stop lands at `fraction` of the GLYPH's own
              box, so 0.5 is a true half — not half of the 24-unit viewBox the glyph is inset in. */}
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
            <stop offset={fraction} stopColor="currentColor" stopOpacity="1" />
            <stop offset={fraction} stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
      ) : null}
    </Glyph>
  );
}
