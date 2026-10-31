import type { ReactElement } from "react";
import type { GridProps } from "../grid.tsx";
import { Grid } from "../grid.tsx";
import type { StackProps } from "../stack.tsx";
import { Stack } from "../stack.tsx";
import { currentVariants } from "./variants.ts";

/**
 * A Stack that marks itself while it is the item a search or a citation points at. The call site sets
 * `aria-current`; the skin keys on it, so the element stays put when the mark comes and goes.
 */
export function CurrentStack({ className, ...rest }: StackProps): ReactElement {
  return <Stack {...rest} className={currentVariants({ className })} tone="neutral" />;
}

/** A Grid that marks itself while it is the item a search points at; `aria-current` is the state, as on {@link CurrentStack}. */
export function CurrentGrid({ className, ...rest }: GridProps): ReactElement {
  return <Grid {...rest} className={currentVariants({ className })} data-tone="neutral" />;
}
