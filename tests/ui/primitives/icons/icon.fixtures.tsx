// CT stories for <Icon> — Playwright CT cannot serialize a component-as-prop across the mount
// boundary (`icon={X}` would arrive as a callback proxy, not a component), so every composition is
// pre-bound here and the tests mount the story (the standard CT wrapper pattern).
import type { FillableIcon, IconProps } from "@orb/ui/icons";
import {
  Bookmark,
  Circle,
  Crown,
  Droplet,
  FastForward,
  Flag,
  Flame,
  Heart,
  Icon,
  Menu,
  Pause,
  Play,
  Settings,
  Shield,
  Square,
  Star,
  SunMoon,
  X,
  Zap,
} from "@orb/ui/icons";
import type { ReactElement } from "react";

type IconSize = NonNullable<IconProps["size"]>;
type IconWeight = NonNullable<IconProps["weight"]>;

export interface CloseIconStoryProps {
  size?: IconSize;
  weight?: IconWeight;
  label?: string;
}

/** `<Icon icon={X}>` pre-composed for tests/ui/primitives/icons/icon.ct.tsx. */
export function CloseIconStory({ size = "md", weight, label }: CloseIconStoryProps): ReactElement {
  // exactOptionalPropertyTypes: forward optional props only when set (an explicit `undefined` is
  // illegal on an optional prop); `size` gets a concrete default so it never forwards `undefined`.
  return <Icon icon={X} size={size} {...(weight === undefined ? {} : { weight })} {...(label === undefined ? {} : { label })} />;
}

export interface StarIconStoryProps {
  fill?: "none" | "solid";
  partialFill?: number;
}

/** `<Icon icon={Star}>` on the fill axes — the fillable single-silhouette glyph. */
export function StarIconStory({ fill, partialFill }: StarIconStoryProps): ReactElement {
  return <Icon icon={Star} {...(fill === undefined ? {} : { fill })} {...(partialFill === undefined ? {} : { partialFill })} />;
}

/** Two partially-filled instances side by side — the id-collision story (each needs its OWN gradient). */
export function TwoPartialStarsStory(): ReactElement {
  return (
    <div>
      <Icon icon={Star} partialFill={0.25} />
      <Icon icon={Star} partialFill={0.75} />
    </div>
  );
}

// EVERY member of the `./fillable` brand list — the gallery screenshot IS the evidence the list
// claims, so it must show all of them, not a sample.
const FILLABLE: readonly [string, FillableIcon][] = [
  ["Circle", Circle],
  ["Crown", Crown],
  ["Star", Star],
  ["Heart", Heart],
  ["Bookmark", Bookmark],
  ["Droplet", Droplet],
  ["Flag", Flag],
  ["Flame", Flame],
  ["Shield", Shield],
  ["Zap", Zap],
  ["Play", Play],
  ["FastForward", FastForward],
  ["Pause", Pause],
  ["Square", Square],
];

// The counter-examples: multi-path outlines cast into the fill axis ON PURPOSE so the gallery shows
// WHY the `FillableIcon` brand exists (SunMoon = many subpaths, Settings/Menu = open strokes).
// Production code cannot do this — `tsc` rejects it; the cast is the point of the demonstration.
// @orb-waive no-test-fabrication(FillableIcon): SunMoon forges the fill brand on purpose: the gallery shows why the brand exists; ends when the gallery stops demonstrating the refused pairing; burn-down item 906.
const FORGED_SUN_MOON = SunMoon as FillableIcon;
// @orb-waive no-test-fabrication(FillableIcon): Settings forges the fill brand on purpose: the gallery shows why the brand exists; ends when the gallery stops demonstrating the refused pairing; burn-down item 906.
const FORGED_SETTINGS = Settings as FillableIcon;
// @orb-waive no-test-fabrication(FillableIcon): Menu forges the fill brand on purpose: the gallery shows why the brand exists; ends when the gallery stops demonstrating the refused pairing; burn-down item 906.
const FORGED_MENU = Menu as FillableIcon;
const NOT_FILLABLE: readonly [string, FillableIcon][] = [
  ["SunMoon", FORGED_SUN_MOON],
  ["Settings", FORGED_SETTINGS],
  ["Menu", FORGED_MENU],
];

const WEIGHTS: readonly IconWeight[] = ["hairline", "regular", "bold"];
const SIZES: readonly IconSize[] = ["xs", "sm", "md", "lg"];
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

/** The axis gallery — the screenshot receipt for weight × size, fill, and partialFill. */
export function IconGalleryStory(): ReactElement {
  return (
    <div className="flex flex-col gap-block bg-background p-block text-foreground">
      <div className="flex flex-col gap-field">
        <span className="text-label text-muted-foreground">weight × size (nonScalingStroke — optical weight is size-independent)</span>
        {WEIGHTS.map((weight) => (
          <div className="flex items-center gap-row" key={weight}>
            <span className="w-24 text-label">{weight}</span>
            {SIZES.map((size) => (
              <Icon icon={Settings} key={size} size={size} weight={weight} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-field">
        <span className="text-label text-muted-foreground">fillable glyphs — none / partial 0.25·0.5·0.75 / solid</span>
        {FILLABLE.map(([name, icon]) => (
          <div className="flex items-center gap-row" key={name}>
            <span className="w-24 text-label">{name}</span>
            {FRACTIONS.map((fraction) => (
              <Icon icon={icon} key={fraction} partialFill={fraction} size="lg" />
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-field">
        <span className="text-label text-muted-foreground">NOT fillable (tsc rejects these — cast here to show why)</span>
        {NOT_FILLABLE.map(([name, icon]) => (
          <div className="flex items-center gap-row" key={name}>
            <span className="w-24 text-label">{name}</span>
            {FRACTIONS.map((fraction) => (
              <Icon icon={icon} key={fraction} partialFill={fraction} size="lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
