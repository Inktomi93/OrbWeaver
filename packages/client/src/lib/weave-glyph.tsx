// WeaveGlyph — the brand mark (the DESIGN.md "Weave"). RE-HOMED from app-shell to lib/ (D62 §13.9):
// features cannot import app-shell, but D62's empty-state decorations need the glyph across features,
// so it lives in the cross-cutting display seam. Still NOT an @orb/ui primitive (brand, not a
// domain-agnostic primitive — §13.9 adjudicates it app-level). Hand-authored inline SVG — geometry,
// not an icon glyph — is the sanctioned exception to the no-inline-svg rule for the brand/data-viz
// allowlist. Ember-tinted via `currentColor` so it inherits the caller's accent without a color literal.

import type { ReactElement } from "react";

export interface WeaveGlyphProps {
  readonly size?: number;
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

/** The woven-orb brand mark: three interlaced arcs around a center node (the "orbweaver" thread). */
export function WeaveGlyph({ size = 24, className, anim = false, decorative = false }: WeaveGlyphProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={anim === true ? `orb-weave-shimmer ${className ?? ""}`.trim() : className}
      // The two arms are mutually exclusive: a NAMED image, or a decoration inside an already-named
      // control. Written as literal attributes (not a spread) so the a11y lint can see the aria-hidden.
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Orbweaver"}
    >
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <path d="M12 3.2a8.8 8.8 0 0 1 7.6 13.2" />
      <path d="M19.6 16.4A8.8 8.8 0 0 1 5.1 18" />
      <path d="M5.1 18A8.8 8.8 0 0 1 12 3.2" />
      <path d="M12 9.8V3.2M14.2 12.9l5.4 3.5M9.8 12.9 5.1 18" opacity="0.5" />
    </svg>
  );
}
