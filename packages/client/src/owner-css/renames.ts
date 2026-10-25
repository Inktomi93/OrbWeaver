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
  ...RETIRED_PROPERTIES.map(propertyRename),
  ...RETIRED_ATTRIBUTES.map(([name, key]): OwnerCssRename => ({ kind: "appearance-attribute", name, to: null, see: appearanceChannelName(key) })),
];
