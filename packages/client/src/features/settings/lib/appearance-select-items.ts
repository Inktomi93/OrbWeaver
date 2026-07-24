// The labelled Select/option tables for the appearance settings surface — pure data, not JSX. Each
// `value` is pinned to the AppearanceSettings field union via `satisfies`, so a typo'd value is a tsc
// error, not a silently-unselectable option.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { APPEARANCE_BACKGROUND_FITS, BLUR_SURFACES } from "@orb/contracts/settings";
import { BACKGROUND_IMAGE_KINDS, THEME_CHAT_STYLES, THEME_DENSITIES } from "@orb/contracts/theme";
import type { SelectItems, SelectOption } from "@orb/ui/select";
import { listSeededBackgrounds } from "#lib";

const CHAT_STYLE_LABELS: Record<AppearanceSettings["chatStyle"], string> = {
  bubble: "Bubble",
  flat: "Flat",
  document: "Document",
  echo: "Echo (bled portrait)",
  whisper: "Whisper (avatar banner)",
  hush: "Hush (flat + speaker stripe)",
  ripple: "Ripple (VN sticky portrait)",
  tide: "Tide (paragraph bubbles)",
};
export const CHAT_STYLE_ITEMS: SelectItems<string> = THEME_CHAT_STYLES.map((value) => ({
  value,
  label: CHAT_STYLE_LABELS[value],
}));

const DENSITY_LABELS: Record<AppearanceSettings["density"], string> = {
  comfortable: "Comfortable",
  compact: "Compact",
};
export const DENSITY_ITEMS: SelectItems<string> = THEME_DENSITIES.map((value) => ({
  value,
  label: DENSITY_LABELS[value],
}));

export const AVATAR_SIZE_ITEMS: SelectItems<string> = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
] satisfies readonly { value: AppearanceSettings["avatarSize"]; label: string }[];

export const AVATAR_SHAPE_ITEMS: SelectItems<string> = [
  { value: "round", label: "Round" },
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
] satisfies readonly { value: AppearanceSettings["avatarShape"]; label: string }[];

export const AVATAR_ASPECT_ITEMS: SelectItems<string> = [
  { value: "square", label: "Square" },
  { value: "portrait", label: "Portrait (2:3)" },
] satisfies readonly { value: AppearanceSettings["avatarAspect"]; label: string }[];

export const AVATAR_RING_ITEMS: SelectItems<string> = [
  { value: "none", label: "None" },
  { value: "accent", label: "Accent" },
] satisfies readonly { value: AppearanceSettings["avatarRing"]; label: string }[];

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

export const MESSAGE_ACTIONS_ITEMS: SelectItems<string> = [
  { value: "hover", label: "Reveal on hover" },
  { value: "expanded", label: "Always visible" },
] satisfies readonly { value: AppearanceSettings["messageActions"]; label: string }[];

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
// options and its label table.
type SelectableBackgroundKind = Exclude<AppearanceSettings["backgroundImageKind"], "external">;
const BACKGROUND_KIND_LABELS: Record<SelectableBackgroundKind, string> = {
  none: "None",
  seeded: "Seeded",
  asset: "Upload",
};
export const BACKGROUND_KIND_ITEMS: SelectItems<string> = BACKGROUND_IMAGE_KINDS.filter((value): value is SelectableBackgroundKind => value !== "external").map(
  (value) => ({
    value,
    label: BACKGROUND_KIND_LABELS[value],
  }),
);
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
