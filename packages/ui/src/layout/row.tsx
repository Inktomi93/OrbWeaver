import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { rowVariants } from "./variants.ts";

export interface RowProps extends ComponentProps<"div">, VariantProps<typeof rowVariants> {}

/**
 * Horizontal flex row on the intent-token spacing scale (UI-Arch §4; ui-package-design §6.1).
 *
 * Usage: `<Row gap="field" justify="between">…</Row>`.
 */
export function Row({ className, gap, align, justify, padding, ...props }: RowProps): ReactElement {
  return <div {...props} className={rowVariants({ gap, align, justify, padding, className })} />;
}
