import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import type { StackProps } from "./stack.tsx";
import { Stack } from "./stack.tsx";
import { dialogBodyVariants } from "./variants.ts";

export interface DialogBodyProps extends StackProps, VariantProps<typeof dialogBodyVariants> {}

/** Keeps scrolling and glyph-hit-area clearance inside the dialog body, without another wrapper. */
export function DialogBody({ className, grow, ...props }: DialogBodyProps): ReactElement {
  return <Stack {...props} className={dialogBodyVariants({ grow, className })} />;
}
