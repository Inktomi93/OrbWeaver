import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { stackVariants } from "./variants.ts";

export interface StackProps extends ComponentProps<"div">, VariantProps<typeof stackVariants> {}

/**
 * Vertical flex stack on the intent-token spacing scale (UI-Arch §4; ui-package-design §6.1).
 *
 * Usage: `<Stack gap="row" padding="block">…</Stack>` — never `className="flex flex-col gap-2"`
 * in feature code (gate no-raw-spacing: structural layout goes through layout primitives).
 */
export function Stack({ className, gap, align, justify, padding, ...props }: StackProps): ReactElement {
  return <div {...props} className={stackVariants({ gap, align, justify, padding, className })} />;
}
