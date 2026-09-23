// The labelled Select/option tables for the APP-SHELL-owned appearance sections (sizing & motion · effects
// · background) — pure data, not JSX. Each `value` is pinned to the AppearanceSettings field union via
// `satisfies`/a total `Record`, so a typo'd value is a tsc error, not a silently-unselectable option.
//
// Split out of the settings feature's one `appearance-select-items.ts` at SET-SEAMS stage 1: the appearance
// pane decomposed into sections owned by their READERS, and app-shell is the reader of every knob below
// (`surfaces/app-shell.tsx` + `#lib`'s background resolver). The chat-owned half (chat display / avatars /
// message actions) lives at `features/chat/lib/appearance-select-items.ts`. The two THEME-shaped tables a
// third feature also renders (chatStyle/density) home at `#lib` instead.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { APPEARANCE_BACKGROUND_FITS, BLUR_SURFACES } from "@orb/contracts/settings";
import type { SelectOption } from "@orb/ui/select";

// FLAT rows typed to the UNION (#866 §7.8) — the illustrated elevation cards key their total diagram
// map off `item.value`, so the table carries the real member type, not a widened string.
export const ELEVATION_ITEMS: readonly SelectOption<AppearanceSettings["elevation"]>[] = [
  { value: "flat", label: "Flat" },
  { value: "ramp", label: "Layered" },
  { value: "glow", label: "Lifted (glow)" },
] satisfies readonly { value: AppearanceSettings["elevation"]; label: string }[];

// surfaceTexture — the opt-in film-grain overlay. It hosts on the WHOLE SHELL (`.shell-grid::after`,
// client globals.css), reading column included — ratified by the owner 2026-08-22 (#435) after this line
// spent its life claiming "chrome/cards only, never the reading surface", which the shipped selector never
// did. The measurement that carried the ruling: sub-12/255 peak contribution over prose at 0.04 under
// `soft-light`, and `prefers-contrast: more` drops the overlay entirely.
export const SURFACE_TEXTURE_ITEMS: readonly SelectOption<string>[] = [
  { value: "none", label: "None" },
  { value: "grain", label: "Film grain" },
] satisfies readonly { value: AppearanceSettings["surfaceTexture"]; label: string }[];

// `messages` carries the reading-surface warning in its own label (never default-checked).
const BLUR_SURFACE_LABELS: Record<AppearanceSettings["blurSurfaces"][number], string> = {
  panels: "Side panels",
  composer: "Composer",
  messages: "Messages (reading surface — use sparingly)",
  modals: "Dialogs",
};
export const BLUR_SURFACE_ITEMS: readonly SelectOption<string>[] = BLUR_SURFACES.map((value) => ({
  value,
  label: BLUR_SURFACE_LABELS[value],
}));

// The `backgroundImageKind` Select RETIRED with the R-BG thumbnail grid (#866 S4): the kind derives from
// the tapped tile and is storage detail, so no items table exists for it any more (recorded in
//  rider — no dead table left behind).
const BACKGROUND_FIT_LABELS: Record<AppearanceSettings["backgroundFit"], string> = {
  cover: "Cover (fill, crop edges)",
  contain: "Contain (fit, may letterbox)",
  center: "Center (actual size)",
  stretch: "Stretch (distort to fill)",
};
export const BACKGROUND_FIT_ITEMS: readonly SelectOption<string>[] = APPEARANCE_BACKGROUND_FITS.map((value) => ({
  value,
  label: BACKGROUND_FIT_LABELS[value],
}));
