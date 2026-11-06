import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import type { StackProps } from "./stack.tsx";
import { Stack } from "./stack.tsx";
import { dialogBodyVariants } from "./variants.ts";

// The body's inline padding is the glyph bleed that offsets its negative margin, so the Stack's inline padding axes
// would be evicted by it; the type leaves them out instead of accepting a prop that paints nothing.
export interface DialogBodyProps extends Omit<StackProps, "padding" | "paddingInline">, VariantProps<typeof dialogBodyVariants> {}

/** Keeps scrolling and glyph-hit-area clearance inside the dialog body, without another wrapper. */
export function DialogBody({ className, grow, ...props }: DialogBodyProps): ReactElement {
  return <Stack {...props} className={dialogBodyVariants({ grow, className })} />;
}
