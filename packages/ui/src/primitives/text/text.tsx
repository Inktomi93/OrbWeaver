import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { textVariants } from "./variants";

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

export interface TextProps extends ComponentProps<"p">, VariantProps<typeof textVariants> {
  /** @defaultValue "p" — the body intrinsic to render. Headings use <Heading>, never `as="h1"`. */
  as?: TextElement;
}

/** Token-driven typographic scale over the body intrinsics (p/span/div) — there is no Base UI text primitive. */
export function Text({ className, as = "p", size, weight, tone, transform, ...rest }: TextProps): ReactElement {
  const Component = TEXT_ELEMENTS[as];
  return <Component data-slot="text" className={cn(textVariants({ size, weight, tone, transform }), className)} {...rest} />;
}

export interface HeadingProps extends ComponentProps<"h1">, VariantProps<typeof textVariants> {
  /** The heading rank 1-6 — REQUIRED, renders the matching real h1-h6 (no styled-div headings). */
  level: HeadingLevel;
}

/** Renders a real h1-h6 with the type-scale skin; `size` defaults from `level`, override for the rare hero. */
export function Heading({ className, level, size, weight = "semibold", tone, transform, ...rest }: HeadingProps): ReactElement {
  const Component = HEADING_ELEMENTS[level];
  return (
    <Component data-slot="heading" className={cn(textVariants({ size: size ?? HEADING_SIZE_BY_LEVEL[level], weight, tone, transform }), className)} {...rest} />
  );
}
