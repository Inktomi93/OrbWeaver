// WeaveGlyph — the brand mark at the rail's head (the DESIGN.md "Weave"). App-shell chrome, NOT an
// @orb/ui primitive (§13.9 homes weave-glyph explicitly at app-shell level). Hand-authored inline
// SVG — geometry, not an icon glyph — is the sanctioned exception to the no-inline-svg rule for the
// data-viz/brand allowlist; the shell is the frame's painter (compose-only exempt). Ember-tinted via
// `currentColor` so it inherits the rail's accent without a raw color literal.

import type { ReactElement } from "react";

export interface WeaveGlyphProps {
  readonly size?: number;
  readonly className?: string;
}

/** The woven-orb brand mark: three interlaced arcs around a center node (the "orbweaver" thread). */
export function WeaveGlyph({ size = 24, className }: WeaveGlyphProps): ReactElement {
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
      className={className}
      role="img"
      aria-label="Orbweaver"
    >
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <path d="M12 3.2a8.8 8.8 0 0 1 7.6 13.2" />
      <path d="M19.6 16.4A8.8 8.8 0 0 1 5.1 18" />
      <path d="M5.1 18A8.8 8.8 0 0 1 12 3.2" />
      <path d="M12 9.8V3.2M14.2 12.9l5.4 3.5M9.8 12.9 5.1 18" opacity="0.5" />
    </svg>
  );
}
