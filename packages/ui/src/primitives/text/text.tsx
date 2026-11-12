import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import type { ToneInkSelection } from "#lib";
import { variantProps } from "#lib";
import { textVariants } from "./variants.ts";

// <Text> paints body prose, never a heading — heading semantics belong to <Heading>.
const TEXT_ELEMENTS = { p: "p", span: "span", div: "div" } as const;
type TextElement = keyof typeof TEXT_ELEMENTS;

// `level` is REQUIRED (no default) so a <Heading> always renders a semantic h1-h6, never a styled div.
const HEADING_ELEMENTS = { 1: "h1", 2: "h2", 3: "h3", 4: "h4", 5: "h5", 6: "h6" } as const;
type HeadingLevel = keyof typeof HEADING_ELEMENTS;

// A deliberate ~1.2 type-scale: h1 → headline, h2+ → title; display stays opt-in for the rare hero moment.
const HEADING_SIZE_BY_LEVEL = {
  1: "headline",
  2: "title",
  3: "title",
  4: "title",
  5: "title",
  6: "title",
} as const;

// The colour pair leaves the recipe's independent axes for `ToneInkSelection`, which makes them exclusive (D336).
type TextAxes = Omit<VariantProps<typeof textVariants>, "tone" | "ink">;

// `hoverCue` and the line cap leave the recipe's independent axes for `TextCue` and `TextCap`, because one arm erases another axis.
// `prose` leaves for `TextProse`, which pairs it with the measure.
interface TextOwnProps extends ComponentProps<"p">, Omit<TextAxes, "hoverCue" | "clamp" | "lines" | "receded" | "unpainted" | "prose"> {
  /** @defaultValue "p" — the body intrinsic to render. Headings use <Heading>, never `as="h1"`. */
  as?: TextElement;
}

// `nudge` makes the run `inline-block`, which the merger reads as the run's width: a named width beside it is erased.
type TextCue = { hoverCue?: "lift" | undefined } | { hoverCue?: "nudge" | undefined; width?: undefined };

// `lines` caps the run at N lines and reserves them, and its `line-clamp` replaces the cap `clamp` wrote: a run takes one of the two.
type TextCap = { clamp?: TextAxes["clamp"]; lines?: undefined } | { clamp?: undefined; lines?: TextAxes["lines"] };

// `unpainted` hides the run's paint while keeping its box and name, and `receded`'s opacity would replace it: a run takes one of the two.
type TextPaint = { receded?: TextAxes["receded"]; unpainted?: undefined } | { receded?: undefined; unpainted?: TextAxes["unpainted"] };

// The prose size is a paragraph, and a paragraph with no measure runs the whole row. So a `p` or `div` takes `prose` only with a `cap`: `cap="prose"` is the
// paragraph's measure, and a run another box already bounds (a truncated or clamped run) writes `cap="fit"`. An inline run (`as="span"`) sits in a line or a box that
// owns the measure, so it takes `prose` with none; a heading has no inline run. The pair leads each props intersection so a missing `cap` is the error TypeScript names.
type HeadingProse = { prose?: false | undefined } | { prose: boolean; cap: NonNullable<TextAxes["cap"]> };
type TextProse = HeadingProse | { prose: boolean; as: "span" };

export type TextProps = TextProse & TextOwnProps & ToneInkSelection & TextCue & TextCap & TextPaint;

/**
 * Token-driven typographic scale over the body intrinsics (p/span/div) — there is no Base UI text primitive.
 *
 * Feature code passes `voice` (UI-Density-Law.md §2.3 — kicker · label · datum · gloss, plus `hero`
 * for THE number, `monogram` for a decorative display glyph, `reading` for the CONTENT prose itself,
 * `credit` for the character/age line under a focal item, the two RECEDED voices `quiet` (a muted body line —
 * an empty state, a "Loading…") and `datumMono` (a mono readout at the code step — an id, a hash, a raw
 * payload), `code` (its foreground twin for machine text you read or copy: an id, a key, an address), and
 * the three PROMOTION voices `masthead` (a surface's one opening sentence, display step, sans — `hero`'s
 * prose twin), `focal` (the one item promoted above its siblings, headline step) and `promoted` (the name
 * of ONE item in a shelf of them, title step — `ListRow`'s `titleStep="promoted"` as a voice)): the voice grammar
 * is what makes a surface's hierarchy
 * legible instead of uniformly loud. `size`/`weight` are the ui-package-internal axes a voice is
 * BUILT from. `tone` is colour by meaning, `ink` a named ink (exclusive with a non-neutral tone) and `strike` a line-through, feature axes beside the voice;
 * `hiddenAt`/`srOnlyAt` swap the text out per pointer class.
 */
export function Text({
  className,
  as = "p",
  size,
  weight,
  tone,
  voice,
  prose,
  ink,
  clamp,
  lines,
  strike,
  truncate,
  grow,
  floor,
  push,
  self,
  scroll,
  maxHeight,
  passThrough,
  cap,
  width,
  textAlign,
  inset,
  flow,
  wrap,
  whitespace,
  numeric,
  hiddenAt,
  srOnlyAt,
  receded,
  unpainted,
  solidLine,
  halo,
  artScale,
  italic,
  selectAll,
  pulse,
  hoverCue,
  ...rest
}: TextProps): ReactElement {
  const Component = TEXT_ELEMENTS[as];
  // The className AND the `data-size`/`data-tone` axis stamp, from ONE selection object (#1080). Spread
  // LAST, after `{...rest}`, deliberately: the seam is the ONE writer of those two attributes, so a call
  // site can no longer hand-write a `data-tone` in a private vocabulary that the walker would then read as
  // an authored recipe arm (#1097 — the refinery-chip collision).
  return (
    <Component
      data-slot="text"
      data-voice={voice}
      // A box that scrolls is a tab stop, or a keyboard cannot reach what it clips; the caller names it (`role="region"` + `aria-label`).
      tabIndex={scroll === undefined ? undefined : 0}
      {...rest}
      {...variantProps(
        textVariants,
        {
          size,
          weight,
          tone,
          voice,
          prose,
          ink,
          clamp,
          lines,
          strike,
          truncate,
          grow,
          floor,
          push,
          self,
          scroll,
          maxHeight,
          passThrough,
          cap,
          width,
          textAlign,
          inset,
          flow,
          wrap,
          whitespace,
          numeric,
          hiddenAt,
          srOnlyAt,
          receded,
          unpainted,
          solidLine,
          halo,
          artScale,
          italic,
          selectAll,
          pulse,
          hoverCue,
        },
        className,
        tone ?? null,
      )}
    />
  );
}

interface HeadingOwnProps extends ComponentProps<"h1">, Omit<TextAxes, "hoverCue" | "clamp" | "lines" | "receded" | "unpainted" | "prose"> {
  /** The heading rank 1-6 — REQUIRED, renders the matching real h1-h6 (no styled-div headings). */
  level: HeadingLevel;
}

export type HeadingProps = HeadingProse & HeadingOwnProps & ToneInkSelection & TextCue & TextCap & TextPaint;

/** Renders a real h1-h6 with the type-scale skin; `size` defaults from `level`, override for the rare hero.
 *  `voice="kicker"` is the section-NAME heading (the mocks' band label) — it keeps the document outline
 *  while dropping to the micro-caps skin, which a styled div would not. */
export function Heading({
  className,
  level,
  size,
  weight = "semibold",
  tone,
  voice,
  prose,
  ink,
  clamp,
  lines,
  strike,
  truncate,
  grow,
  floor,
  push,
  self,
  scroll,
  maxHeight,
  passThrough,
  cap,
  width,
  textAlign,
  inset,
  flow,
  wrap,
  whitespace,
  numeric,
  hiddenAt,
  srOnlyAt,
  receded,
  unpainted,
  solidLine,
  halo,
  artScale,
  italic,
  selectAll,
  pulse,
  hoverCue,
  ...rest
}: HeadingProps): ReactElement {
  const Component = HEADING_ELEMENTS[level];
  return (
    <Component
      data-slot="heading"
      data-voice={voice}
      {...rest}
      {...variantProps(
        textVariants,
        {
          size: size ?? HEADING_SIZE_BY_LEVEL[level],
          weight,
          tone,
          voice,
          prose,
          ink,
          clamp,
          lines,
          strike,
          truncate,
          grow,
          floor,
          push,
          self,
          scroll,
          maxHeight,
          passThrough,
          cap,
          width,
          textAlign,
          inset,
          flow,
          wrap,
          whitespace,
          numeric,
          hiddenAt,
          srOnlyAt,
          receded,
          unpainted,
          solidLine,
          halo,
          artScale,
          italic,
          selectAll,
          pulse,
          hoverCue,
        },
        className,
        tone ?? null,
      )}
    />
  );
}
