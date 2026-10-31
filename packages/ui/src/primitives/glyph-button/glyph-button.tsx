import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { variantProps } from "#lib";
import type { ButtonCoreProps, ButtonPaint } from "../button/core.tsx";
import { ButtonCore } from "../button/core.tsx";
import { glyphButtonVariants } from "./variants.ts";

export type GlyphStep = NonNullable<VariantProps<typeof glyphButtonVariants>["glyph"]>;

/**
 * An icon-only micro control at a glyph step. No text child fits the box, so the accessible name is an attribute
 * (§13.10 N1); a glyph button with neither `aria-label` nor `aria-labelledby` fails `tsc`.
 */
export type GlyphButtonProps = ButtonCoreProps & ButtonPaint & { readonly glyph: GlyphStep } & ({ "aria-label": string } | { "aria-labelledby": string });

export function GlyphButton({ glyph, variant = "solid", ...rest }: GlyphButtonProps): ReactElement {
  return <ButtonCore {...rest} variant={variant} box={variantProps(glyphButtonVariants, { glyph })} />;
}
