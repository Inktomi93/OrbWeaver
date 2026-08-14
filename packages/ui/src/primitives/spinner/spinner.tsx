// WebSpinner — THE loader (owner ruling 2026-08-09: ONE loader system, no legacy pair; docs/design/
// login-loading-screen.md §2/§4.2/§9). The brand glyph with a slow orb rotation (--motion-ambient)
// and — since weave-lab-upgrades.md §4 — a WEAVE loop on its spiral (--motion-shimmer): the silk
// draws out from the hub, holds, then pays out, forever. The loader IS a web being spun, which is the
// same story as the hero weave told in one glyph, NOT the hero weave shrunk (that is
// `@orb/ui/web-weave`).
//
// One identity, a size spectrum: sm/md/lg are the SAME 16/20/24px as the icon table, so the legacy
// Loader2 `Spinner`'s call sites map onto this 1:1 (`<Spinner size label>` → `<WebSpinner size label>`
// — the follow-up lane's mechanical swap); xl/hero cover standalone waits (the A9 redirect card).
// Small sizes ride the COMPACT glyph cut (6 spokes, fatter — the §8 favicon discipline: tiny sizes
// get a tiny-cut, never the display mark scaled down).
//
// The glyph is the icon-seal's own `OrbWeb`/`OrbWebCompact` (no inline <svg> — §13.7); the motion is
// CSS in globals.css keyed on `data-animate` + the stamped `orb-web-pulse`/`orb-web-spokes` classes
// (the `pulse` class name predates the weave loop it now carries — renaming it is a three-file
// string-paired edit, deliberately not bundled into a motion change)
// (string-paired by name — grep both on rename). `data-animate` is JS-removed under reduced motion
// (guide §3.9 REMOVE: computed `animation-name: none`, not a frozen dash), which also keeps the
// resting glyph SOLID — the dash pattern only exists while the pulse animates.

import type { CSSProperties, ReactElement } from "react";
import { usePrefersReducedMotion } from "#lib";
import { ORB_WEB_GLYPH, ORB_WEB_GLYPH_COMPACT, OrbWeb, OrbWebCompact } from "#primitives/icons";
import { spinnerVariants } from "./variants.ts";

/** The px-per-size table. sm/md/lg mirror ICON_SM/MD/LG so the Loader2 swap is call-shape identical. */
const WEB_SPINNER_SIZES = { sm: 16, md: 20, lg: 24, xl: 32, hero: 48 } as const;
/** The compact-cut ceiling: at and below this px the 16px cut renders (above it, the display mark). */
const COMPACT_MAX_PX = 20;
/** Dash lengths are rounded UP to a whole user unit: a dasharray a hair shorter than the path leaves a
 *  sliver of silk showing at the "empty" end of the loop. */
const SPIRAL_LENGTH_PRECISION = 0;

export interface WebSpinnerProps {
  size?: keyof typeof WEB_SPINNER_SIZES;
  /** Accessible name announced by `role="status"` — required (a spinner is a live status). */
  label: string;
  className?: string;
}

/** The brand loader — indeterminate waits at every scale (the sanctioned spinner; skeletons still
 *  own layout loading). Inherits `currentColor`; tint via className (`text-primary` for brand waits). */
export function WebSpinner({ size = "md", label, className }: WebSpinnerProps): ReactElement {
  const slots = spinnerVariants();
  const reduced = usePrefersReducedMotion();
  const px = WEB_SPINNER_SIZES[size];
  const compact = px <= COMPACT_MAX_PX;
  const Glyph = compact ? OrbWebCompact : OrbWeb;
  const spiralLength = (compact ? ORB_WEB_GLYPH_COMPACT : ORB_WEB_GLYPH).spiralLength;
  // The weave loop rides the actual spiral arc length (icon user units) — a CSS constant can't know
  // it, so the component hands it over as the custom property the globals.css rules consume.
  const dashVars = {
    "--orb-web-spiral-length": `${spiralLength.toFixed(SPIRAL_LENGTH_PRECISION)}px`,
  } as CSSProperties;
  return (
    <span data-slot="web-spinner" role="status" data-animate={reduced ? undefined : ""} className={slots.root({ className })} style={dashVars}>
      <Glyph size={px} aria-hidden={true} />
      <span className={slots.label()}>{label}</span>
    </span>
  );
}
