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
import { BACKGROUND_IMAGE_KINDS } from "@orb/contracts/theme";
import type { SelectItems, SelectOption } from "@orb/ui/select";
import { BACKGROUND_KIND_LABELS, listSeededBackgrounds } from "#lib";

export const ELEVATION_ITEMS: SelectItems<string> = [
  { value: "flat", label: "Flat" },
  { value: "ramp", label: "Layered" },
  { value: "glow", label: "Lifted (glow)" },
] satisfies readonly { value: AppearanceSettings["elevation"]; label: string }[];

// surfaceTexture — the opt-in film-grain overlay. Chrome/cards only, never the reading surface.
export const SURFACE_TEXTURE_ITEMS: SelectItems<string> = [
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

// `external` is a transient INPUT-only kind (the picker's URL-entry branch), never a persisted paintable
// state (BG-C invariant, contracts/settings) — so it is excluded from the selectable background-kind
// options here. The labels themselves ride the shared `#lib` table (one home with the carried-background
// picker, which DOES offer the URL branch — its writes materialize server-side).
export const BACKGROUND_KIND_ITEMS: SelectItems<string> = BACKGROUND_IMAGE_KINDS.filter((value) => value !== "external").map((value) => ({
  value,
  label: BACKGROUND_KIND_LABELS[value],
}));
const BACKGROUND_FIT_LABELS: Record<AppearanceSettings["backgroundFit"], string> = {
  cover: "Cover (fill, crop edges)",
  contain: "Contain (fit, may letterbox)",
  center: "Center (actual size)",
  stretch: "Stretch (distort to fill)",
};
export const BACKGROUND_FIT_ITEMS: SelectItems<string> = APPEARANCE_BACKGROUND_FITS.map((value) => ({
  value,
  label: BACKGROUND_FIT_LABELS[value],
}));
export const SEEDED_BACKGROUND_ITEMS: SelectItems<string> = listSeededBackgrounds().map((bg) => ({
  value: bg.id,
  label: bg.label,
}));
