// Fill-suitable glyphs carry a phantom brand so Icon rejects unsupported fill combinations.
// Multi-shape glyphs resolve partial-fill gradients per subpath, not across the combined silhouette.
import type { LucideIcon } from "lucide-react";
import {
  Bookmark as BookmarkGlyph,
  Circle as CircleGlyph,
  Crown as CrownGlyph,
  Droplet as DropletGlyph,
  FastForward as FastForwardGlyph,
  Flag as FlagGlyph,
  Flame as FlameGlyph,
  Heart as HeartGlyph,
  Play as PlayGlyph,
  Shield as ShieldGlyph,
  Square as SquareGlyph,
  Star as StarGlyph,
  Zap as ZapGlyph,
} from "lucide-react";

declare const fillable: unique symbol;

/** A curated lucide glyph whose closed subpaths ARE its silhouette — the only icons the `fill` /
 *  `partialFill` axes accept. Phantom brand, erased at runtime (the value IS the lucide component). */
export type FillableIcon = LucideIcon & { readonly [fillable]: true };

export const Bookmark: FillableIcon = BookmarkGlyph as FillableIcon;
/** The ONE-SUBPATH extreme: a bare `<circle r=10>`, so a solid fill is a filled DISC and a partial fill is
 *  a clean vertical wipe. It is the row STATE dot (a pressed one-of-N pick reads as filled vs hollow —
 *  a shape delta, WCAG 1.4.1). */
export const Circle: FillableIcon = CircleGlyph as FillableIcon;
/** The closed crown silhouette fills; its separate open baseline remains a stroke. */
export const Crown: FillableIcon = CrownGlyph as FillableIcon;
export const Droplet: FillableIcon = DropletGlyph as FillableIcon;
/** Two closed triangles, each of which fills solid (the composer's steer-ready Continue). */
export const FastForward: FillableIcon = FastForwardGlyph as FillableIcon;
export const Flag: FillableIcon = FlagGlyph as FillableIcon;
export const Flame: FillableIcon = FlameGlyph as FillableIcon;
export const Heart: FillableIcon = HeartGlyph as FillableIcon;
export const Play: FillableIcon = PlayGlyph as FillableIcon;
export const Shield: FillableIcon = ShieldGlyph as FillableIcon;
export const Square: FillableIcon = SquareGlyph as FillableIcon;
export const Star: FillableIcon = StarGlyph as FillableIcon;
export const Zap: FillableIcon = ZapGlyph as FillableIcon;
