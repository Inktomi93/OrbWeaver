// App-level brand display shared across features (D62); the UI package owns its reusable geometry.
// This component owns the named-image versus decorative-control accessibility contract.

import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import type { ToneInkSelection } from "#lib";
import { variantAttrs } from "#lib";
import { weaveGlyphVariants } from "./variants.ts";
import { WEB_GLYPH_DISPLAY } from "./web-glyph.ts";

// Mark-A stroke tuning (the 32-space display cut of D173's mark).
const SPOKE_W = 1.3;
const SPOKE_OPACITY = 0.9;
const SPIRAL_W = 1.5;
const DEW_R = 1.5;
const DEW_OPACITY = 0.95;
const SPOKES_D = WEB_GLYPH_DISPLAY.spokes.map((s) => `M ${s.x1.toFixed(2)} ${s.y1.toFixed(2)} L ${s.x2.toFixed(2)} ${s.y2.toFixed(2)}`).join(" ");

interface WeaveGlyphOwnProps {
  readonly size?: VariantProps<typeof weaveGlyphVariants>["size"];
  readonly className?: string;
  /**
   * Silk-shimmer breathe (mockup `shell.jsx WeaveGlyph anim`) — a slow opacity pulse for the
   * empty-state "Weave your first thread" hero moment. Reduced-motion-safe: the unlayered floor in the
   * ui package's global stylesheet freezes the animation to a static glyph under `prefers-reduced-motion`.
   */
  readonly anim?: boolean;
  /**
   * Drops the glyph out of the a11y tree (`aria-hidden`, no role/name) — for a glyph that is the visual
   * body of an ALREADY-NAMED control (the rail brand button, which is labelled "Home"). Without it the
   * button announced its own name plus a nested "Orbweaver" image.
   */
  readonly decorative?: boolean;
}

export type WeaveGlyphProps = WeaveGlyphOwnProps & ToneInkSelection;

/** The open-orb brand mark: eight spokes, one open spiral, the hub, a single dew drop. Its colour is a `tone`
 *  (`primary` is the brand's own) or a named `ink`, from the Text maps. */
export function WeaveGlyph({ size, className, anim = false, decorative = false, tone, ink }: WeaveGlyphProps): ReactElement {
  return (
    <svg
      viewBox={`0 0 ${WEB_GLYPH_DISPLAY.viewBox} ${WEB_GLYPH_DISPLAY.viewBox}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      className={weaveGlyphVariants({ size, tone, ink, anim, className })}
      {...variantAttrs(weaveGlyphVariants, { size, tone }, tone ?? null)}
      // The two arms are mutually exclusive: a NAMED image, or a decoration inside an already-named
      // control. Written as literal attributes (not a spread) so the a11y lint can see the aria-hidden.
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Orbweaver"}
    >
      <path d={SPOKES_D} strokeWidth={SPOKE_W} opacity={SPOKE_OPACITY} />
      <path d={WEB_GLYPH_DISPLAY.spiralPath} strokeWidth={SPIRAL_W} />
      <circle cx={WEB_GLYPH_DISPLAY.hub.x} cy={WEB_GLYPH_DISPLAY.hub.y} r={WEB_GLYPH_DISPLAY.hub.r} fill="currentColor" stroke="none" />
      <circle cx={WEB_GLYPH_DISPLAY.dew.x} cy={WEB_GLYPH_DISPLAY.dew.y} r={DEW_R} fill="currentColor" stroke="none" opacity={DEW_OPACITY} />
    </svg>
  );
}
