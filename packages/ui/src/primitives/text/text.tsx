import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { textVariants } from "./variants";

// The polymorphic body-text elements: ONE importable union + a mapped dispatch (Spine string-union
// discipline — a new member is a tsc error, never an inline `as` string template). <Text> paints body
// prose, never a heading — heading semantics belong to <Heading> so an h1-h6 is always a real heading.
const TEXT_ELEMENTS = { p: "p", span: "span", div: "div" } as const;
type TextElement = keyof typeof TEXT_ELEMENTS;

// The heading level → real intrinsic tag map. `level` is REQUIRED (no default) and drives this Record
// so a <Heading> ALWAYS renders a semantic h1-h6 — never a styled <div> that looks like a heading
// (§13.8 R1/R4 — the a11y/semantic-element correctness the type-scale seal exists to guarantee).
const HEADING_ELEMENTS = { 1: "h1", 2: "h2", 3: "h3", 4: "h4", 5: "h5", 6: "h6" } as const;
type HeadingLevel = keyof typeof HEADING_ELEMENTS;

// ComponentProps<"p"> is the passthrough base for the polymorphic body element (R5 — never a hand-picked
// subset). The p/span/div attribute surfaces are effectively identical (global HTML attrs), so one base
// covers all three `as` targets without a per-tag generic.
export interface TextProps extends ComponentProps<"p">, VariantProps<typeof textVariants> {
  /** @defaultValue "p" — the body intrinsic to render. Headings use <Heading>, never `as="h1"`. */
  as?: TextElement;
}

/**
 * Text — the body-text seal: a token-driven typographic scale over the body intrinsics (p/span/div).
 * There is no Base UI text primitive (text is intrinsic), so this IS the primitive — the scale that
 * routes/features compose instead of painting raw `<p className>` (UI-Primitives §13.8 R1/R4).
 *
 * Usage: `<Text size="label" tone="muted">auth isn’t wired yet.</Text>` · `<Text as="span">inline</Text>`
 */
export function Text({
  className,
  as = "p",
  size,
  weight,
  tone,
  ...rest
}: TextProps): ReactElement {
  const Component = TEXT_ELEMENTS[as];
  return (
    <Component
      data-slot="text"
      className={cn(textVariants({ size, weight, tone }), className)}
      {...rest}
    />
  );
}

// ComponentProps<"h1"> is the passthrough base; every h1-h6 shares the same heading attribute surface.
export interface HeadingProps extends ComponentProps<"h1">, VariantProps<typeof textVariants> {
  /** The heading rank 1-6 — REQUIRED, renders the matching real h1-h6 (no styled-div headings). */
  level: HeadingLevel;
}

/**
 * Heading — the heading seal: renders a REAL h1-h6 (chosen by `level`, no default) with the type-scale
 * skin. Defaults `size="title" weight="semibold"` — the design direction is a deliberately understated
 * flat size scale with hierarchy carried BY WEIGHT (UI-Architecture §4.1), so levels read similarly by
 * intent; override `size` for the rare display case.
 *
 * Usage: `<Heading level={1}>admin</Heading>` · `<Heading level={2} size="headline">Section</Heading>`
 */
export function Heading({
  className,
  level,
  size = "title",
  weight = "semibold",
  tone,
  ...rest
}: HeadingProps): ReactElement {
  const Component = HEADING_ELEMENTS[level];
  return (
    <Component
      data-slot="heading"
      className={cn(textVariants({ size, weight, tone }), className)}
      {...rest}
    />
  );
}
