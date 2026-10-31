import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { variantProps } from "#lib";
import { inlineTokenVariants } from "./variants.ts";

export interface InlineTokenProps extends ComponentProps<"span">, VariantProps<typeof inlineTokenVariants> {}

/**
 * InlineToken — a chip that sits inside a run of prose and must not perturb the line box it lives in. Compose a leading
 * `<Icon>` from `@orb/ui/icons` as the first child for a glyph. A status pill beside a control is a `Badge`.
 */
export function InlineToken({ className, tone, ...props }: InlineTokenProps): ReactElement {
  return <span data-slot="badge" {...props} {...variantProps(inlineTokenVariants, { tone }, className, tone ?? "neutral")} />;
}
