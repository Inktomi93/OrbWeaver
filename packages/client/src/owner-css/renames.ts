// The rename table of the owner-CSS theme contract. A hook that leaves `owner-css-surface.ts` needs a row here
// or `surface:build` refuses to regenerate. The injection path rewrites each `name` to `to` before a theme's CSS
// reaches the document, so a theme written against the old name keeps working. Keep `to` on a current name:
// chains are not followed. A row with no `to` only warns, because the old value has no one-to-one new form.
import { APPEARANCE_CHANNEL_ROWS, appearanceChannelName } from "../lib/appearance-carrier-manifest.ts";
import type { OwnerCssRename } from "./hook.ts";

type AppearanceKey = Parameters<typeof appearanceChannelName>[0];

// The root custom properties the appearance channel replaced, each with the setting that now carries it.
const RETIRED_PROPERTIES = [
  ["--font-scale", "fontScale"],
  ["--blur-strength", "blurStrength"],
  ["--reading-line-height", "readingLineHeight"],
  ["--reading-letter-spacing", "readingLetterSpacing"],
  ["--reading-paragraph-spacing", "readingParagraphSpacing"],
  ["--reading-name-scale", "readingNameScale"],
  ["--reading-body-scale", "readingBodyScale"],
] as const satisfies readonly (readonly [string, AppearanceKey])[];

// The root attributes the channel replaced. The old form was presence or `"true"`, the new one is a value, so a
// name swap alone would change what the selector matches.
const RETIRED_ATTRIBUTES = [
  ["data-blur-panels", "blurSurfaces"],
  ["data-blur-composer", "blurSurfaces"],
  ["data-blur-messages", "blurSurfaces"],
  ["data-blur-modals", "blurSurfaces"],
  ["data-shadow", "shadowEffects"],
  ["data-justify-body-text", "justifyBodyText"],
  ["data-theme-colorization", "enableThemeColorization"],
  ["data-texture", "surfaceTexture"],
  ["data-reduced-motion", "reducedMotion"],
] as const satisfies readonly (readonly [string, AppearanceKey])[];

// A registered property is a unitless number; the old one carried its unit, so only a unitless setting is a drop-in.
function propertyRename([name, key]: readonly [string, AppearanceKey]): OwnerCssRename {
  const successor = appearanceChannelName(key);
  const unitless = APPEARANCE_CHANNEL_ROWS.find((row) => row.key === key)?.unit === "";
  return unitless ? { kind: "token", name, to: successor } : { kind: "token", name, to: null, see: successor };
}

export const OWNER_CSS_RENAMES: readonly OwnerCssRename[] = [
  { kind: "slot", name: "origin", to: null },
  { kind: "slot", name: "transcript-history", to: null, see: "message-list-leading" },
  { kind: "slot", name: "message-metadata-edited", to: null, see: "message-metadata-timestamp" },
  { kind: "slot", name: "drawer-tap-guard", to: null },
  { kind: "slot", name: "character-spoiler-field", to: null, see: "spoiler" },
  { kind: "slot", name: "persona-row-expand", to: null, see: "list-row-body" },
  { kind: "slot", name: "persona-row-name", to: null, see: "list-row-title" },
  { kind: "slot", name: "chat-style-stripe", to: "chat-style-tick" },
  { kind: "slot", name: "labels-control-row", to: null, see: "list-search" },
  { kind: "slot", name: "stat-figure-delta", to: null },
  { kind: "slot", name: "stat-figure-sparkline", to: null },
  { kind: "slot", name: "compare-block-accept", to: null },
  { kind: "slot", name: "compare-blocks-accept-all", to: null },
  { kind: "slot", name: "table-select-cell", to: null },
  { kind: "slot", name: "table-select-header", to: null },
  // The shared error block replaced it on every read, so a one-to-one rename would restyle every failed read.
  { kind: "slot", name: "provenance-error", to: null, see: "query-error" },
  { kind: "token", name: "--breakpoint-shell-short", to: null },
  { kind: "token", name: "--stroke-width-icon-hairline", to: null },
  { kind: "token", name: "--height-picker-art-square", to: null },
  { kind: "token", name: "--border-width-accent", to: "--border-width-rule" },
  // Tailwind read both once, at build time, so an override never moved a border; the weight they pointed at is the knob.
  { kind: "token", name: "--default-border-width", to: "--border-width-default" },
  { kind: "token", name: "--default-ring-width", to: "--border-width-default" },
  ...RETIRED_PROPERTIES.map(propertyRename),
  ...RETIRED_ATTRIBUTES.map(([name, key]): OwnerCssRename => ({ kind: "appearance-attribute", name, to: null, see: appearanceChannelName(key) })),
];
