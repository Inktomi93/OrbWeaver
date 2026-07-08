// The labelled Select/option tables for the appearance settings surface (D44 §12.1) — split out of
// `appearance-settings-surface.tsx` (UI-Arch §2.1 component-size gate, cap 450 lines) since this is
// pure data, not JSX. Each `value` is pinned to the `AppearanceSettings` field union (`satisfies`), so
// a typo'd value is a tsc error, not a silently-unselectable option. chatStyle/density values come from
// the #theme canonical tuples (one home); avatarSize/avatarShape/avatarAspect/avatarRing are the
// schema's inline enums (single-consumer, `no-inline-union-redecl` — see the schema's own header note).

import type { AppearanceSettings } from "@orb/contracts/settings";
import {
  APPEARANCE_BACKGROUND_FITS,
  BACKGROUND_IMAGE_KINDS,
  BLUR_SURFACES,
} from "@orb/contracts/settings";
import { THEME_CHAT_STYLES, THEME_DENSITIES } from "@orb/contracts/theme";
import type { SelectItems, SelectOption } from "@orb/ui/select";
import { listSeededBackgrounds } from "#lib";

const CHAT_STYLE_LABELS: Record<AppearanceSettings["chatStyle"], string> = {
  bubble: "Bubble",
  flat: "Flat",
  document: "Document",
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

// §B.3 avatar versatility — the presence lever the Phase-4 immersive VN/Ripple mode needs, plus a
// reuse-ready accent ring (Moonlit's `is_fav`/`selected` glow).
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
] satisfies readonly { value: AppearanceSettings["elevation"]; label: string }[];

export const MESSAGE_ACTIONS_ITEMS: SelectItems<string> = [
  { value: "hover", label: "Reveal on hover" },
  { value: "expanded", label: "Always visible" },
] satisfies readonly { value: AppearanceSettings["messageActions"]; label: string }[];

// WS3 — the blurSurfaces multi-select. `messages` carries the Reading-Surface-rule warning in its own
// label/description (never default-checked — glass behind scrolling prose is the one surface the
// picker itself should visibly flag, not just omit from a default).
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

// D63 — the app background-image picker items (moved off the theme; palette-independent). `asset` (own
// upload) is deliberately absent from BACKGROUND_IMAGE_KINDS (PD-131 — no client asset-URL resolver/
// upload flow exists yet); seeded/external are the two that actually resolve.
const BACKGROUND_KIND_LABELS: Record<AppearanceSettings["backgroundImageKind"], string> = {
  none: "None",
  seeded: "Seeded",
  external: "URL",
};
export const BACKGROUND_KIND_ITEMS: SelectItems<string> = BACKGROUND_IMAGE_KINDS.map((value) => ({
  value,
  label: BACKGROUND_KIND_LABELS[value],
}));
const BACKGROUND_FIT_LABELS: Record<AppearanceSettings["backgroundFit"], string> = {
  cover: "Cover (fill, crop edges)",
  contain: "Contain (fit, may letterbox)",
};
export const BACKGROUND_FIT_ITEMS: SelectItems<string> = APPEARANCE_BACKGROUND_FITS.map(
  (value) => ({
    value,
    label: BACKGROUND_FIT_LABELS[value],
  }),
);
export const SEEDED_BACKGROUND_ITEMS: SelectItems<string> = listSeededBackgrounds().map((bg) => ({
  value: bg.id,
  label: bg.label,
}));
