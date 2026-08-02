/**
 * The FILL-SUITABLE subset of the curated lucide set, branded so `tsc` — not a runtime surprise —
 * rejects `<Icon fill="solid">` / `partialFill` on a glyph that renders badly filled.
 *
 * WHY a subset exists at all: lucide states fills are **officially not supported**
 * (https://lucide.dev/guide/react/advanced/filled-icons — "Fills are officially not supported.
 * However, all SVG properties are available on all icons. Fill can still be used and will work fine
 * on certain icons."). Every lucide glyph is a STROKE drawing; `fill` paints each closed subpath.
 * That reads correctly only when the glyph's closed subpaths ARE its silhouette — one closed outline
 * (Star/Heart/Droplet/Flame/Bookmark/Shield/Zap/Play/Flag) or a set of closed shapes that each want
 * to be solid (Pause's two bars, Square's rect). A multi-path outline fills its interior detail into
 * an unreadable blob (SunMoon, Settings), and an OPEN-stroke glyph fills nothing at all (Menu) —
 * both are rendered in the gallery as the counter-examples.
 *
 * CAVEAT on the multi-shape members (Pause): a `partialFill` gradient resolves in objectBoundingBox
 * units, i.e. per SUBPATH — Pause at 0.5 is two half-filled bars, not one half-filled pair. Legible,
 * but a fraction that must read as ONE meter wants a single-outline glyph.
 *
 * MEMBERSHIP IS EVIDENCE-BASED, not taste: every name below is rendered at 0 / 0.25 / 0.5 / 0.75 / 1
 * by the gallery story (`IconGalleryStory` → the screenshot receipt in
 * tests/ui/primitives/icons/icon.ct.tsx) and was read from that screenshot. Adding a name is the same
 * two steps as growing the seal itself (index.ts): add it here, then LOOK at the gallery.
 */

import type { LucideIcon } from "lucide-react";
import {
  Bookmark as BookmarkGlyph,
  Droplet as DropletGlyph,
  Flag as FlagGlyph,
  Flame as FlameGlyph,
  Heart as HeartGlyph,
  Pause as PauseGlyph,
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
export const Droplet: FillableIcon = DropletGlyph as FillableIcon;
export const Flag: FillableIcon = FlagGlyph as FillableIcon;
export const Flame: FillableIcon = FlameGlyph as FillableIcon;
export const Heart: FillableIcon = HeartGlyph as FillableIcon;
export const Pause: FillableIcon = PauseGlyph as FillableIcon;
export const Play: FillableIcon = PlayGlyph as FillableIcon;
export const Shield: FillableIcon = ShieldGlyph as FillableIcon;
export const Square: FillableIcon = SquareGlyph as FillableIcon;
export const Star: FillableIcon = StarGlyph as FillableIcon;
export const Zap: FillableIcon = ZapGlyph as FillableIcon;
