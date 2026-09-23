// The orb-web BRAND glyph, minted through the lucide seal (D173
// — "one emblem, every scale"). This is the sanctioned channel for a custom glyph: §13.7 bans inline
// `<svg>` outside charts/**, and `createLucideIcon` is lucide-react's public custom-icon API — the
// glyph renders through the same component class as every curated icon (size/stroke/aria behave
// identically), and lucide-react stays imported ONLY inside this dir (dep-cruiser `ui-satellite-seals`).
//
// GEOMETRY LIVES ONCE: `art/web-weave/web-weave-geometry.ts` `webGlyph()` — the same maths behind the
// favicon, the client `WeaveGlyph` mark, and the full weave's settled frame. Emitted here in the
// 24-space lucide requires (createLucideIcon hardcodes `viewBox="0 0 24 24"`).
//
// Two cuts (the §8 favicon discipline — never the display mark scaled down):
//   ORB_WEB          — display: 8 spokes, 2.6 open turns + the dew drop (wordmarks, spinner lg+).
//   ORB_WEB_COMPACT  — 16px cut: 6 spokes, 1.7 fatter turns, no dew (tab-strip sizes, spinner sm/md).
//
// The stamped classes below are the WebSpinner's animation hooks (`orb-web-spin` rotates the svg;
// the spiral's `orb-web-pulse` carries the WEAVE loop — it draws out and pays out, weave-lab §4;
// `orb-web-spokes` breathes under it) —
// the CSS lives in `src/styles/globals.css`, gated on the spinner's `data-animate` so a resting
// glyph renders solid (no dash) and reduced motion removes the animation entirely (guide §3.9).
// String-keyed seam: these literals pair with globals.css BY NAME — grep both when renaming.

import type { LucideIcon } from "lucide-react";
import { createLucideIcon } from "lucide-react";
import type { WebGlyphGeometry } from "../../art/web-weave/web-glyph.ts";
import { webGlyph } from "../../art/web-weave/web-glyph.ts";

/** The lucide icon grid — createLucideIcon renders `viewBox="0 0 24 24"`, so the glyph is emitted in 24-space. */
const LUCIDE_VIEW = 24;
const COORD_PRECISION = 2;
// Stroke widths tuned per cut (32-space asset values × 24/32): display stays airy, compact stays
// legible at 16px (§8: "fewer elements, fatter strokes").
const DISPLAY_SPOKE_W = "0.98";
const DISPLAY_SPIRAL_W = "1.13";
const COMPACT_SPOKE_W = "1.43";
const COMPACT_SPIRAL_W = "1.58";
const SPOKE_OPACITY = "0.9";
const DEW_OPACITY = "0.95";
const DEW_R = 1.13;

/** The display glyph in 24-space (also consumed by WebSpinner for its dash-period metrics). */
export const ORB_WEB_GLYPH: WebGlyphGeometry = webGlyph({ spokes: 8, turns: 2.6, spiralEndRadius: 13.5, view: LUCIDE_VIEW });
/** The compact (16px-cut) glyph in 24-space. */
export const ORB_WEB_GLYPH_COMPACT: WebGlyphGeometry = webGlyph({ spokes: 6, turns: 1.7, spiralEndRadius: 10.6, view: LUCIDE_VIEW });

function spokesPath(glyph: WebGlyphGeometry): string {
  return glyph.spokes
    .map((s) => `M ${s.x1.toFixed(COORD_PRECISION)} ${s.y1.toFixed(COORD_PRECISION)} L ${s.x2.toFixed(COORD_PRECISION)} ${s.y2.toFixed(COORD_PRECISION)}`)
    .join(" ");
}

interface OrbWebIconSpec {
  readonly name: string;
  readonly glyph: WebGlyphGeometry;
  readonly spokeWidth: string;
  readonly spiralWidth: string;
  readonly dew: boolean;
}

function orbWebIcon({ name, glyph, spokeWidth, spiralWidth, dew }: OrbWebIconSpec): LucideIcon {
  const nodes: [string, Record<string, string>][] = [
    ["path", { d: spokesPath(glyph), strokeWidth: spokeWidth, opacity: SPOKE_OPACITY, className: "orb-web-spokes", key: "spokes" }],
    ["path", { d: glyph.spiralPath, strokeWidth: spiralWidth, className: "orb-web-pulse", key: "spiral" }],
    ["circle", { cx: String(glyph.hub.x), cy: String(glyph.hub.y), r: String(glyph.hub.r), fill: "currentColor", stroke: "none", key: "hub" }],
  ];
  if (dew) {
    nodes.push([
      "circle",
      {
        cx: glyph.dew.x.toFixed(COORD_PRECISION),
        cy: glyph.dew.y.toFixed(COORD_PRECISION),
        r: String(DEW_R),
        fill: "currentColor",
        stroke: "none",
        opacity: DEW_OPACITY,
        key: "dew",
      },
    ]);
  }
  // createLucideIcon types attrs Record<string, string>; className is a legal React prop spelling here.
  return createLucideIcon(name, nodes as Parameters<typeof createLucideIcon>[1]);
}

/** The orb-web mark, display cut — the brand glyph as a first-class member of the icon seal. */
export const OrbWeb: LucideIcon = orbWebIcon({ name: "OrbWeb", glyph: ORB_WEB_GLYPH, spokeWidth: DISPLAY_SPOKE_W, spiralWidth: DISPLAY_SPIRAL_W, dew: true });
/** The orb-web mark, 16px cut — for tab-strip-sized renders (spinner sm/md). */
export const OrbWebCompact: LucideIcon = orbWebIcon({
  name: "OrbWebCompact",
  glyph: ORB_WEB_GLYPH_COMPACT,
  spokeWidth: COMPACT_SPOKE_W,
  spiralWidth: COMPACT_SPIRAL_W,
  dew: false,
});
