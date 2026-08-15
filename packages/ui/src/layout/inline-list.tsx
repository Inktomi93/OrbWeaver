import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { rowVariants } from "./variants.ts";

export interface InlineListProps extends ComponentProps<"ul">, VariantProps<typeof rowVariants> {}

/** A semantic horizontal list with the same intent-token spacing axes as `Row`. */
export function InlineList({ className, gap, align, justify, padding, ...props }: InlineListProps): ReactElement {
  const resetClassName = className === undefined ? "m-0 list-none p-0" : `m-0 list-none p-0 ${className}`;
  return <ul {...props} className={rowVariants({ gap, align, justify, padding, className: resetClassName })} />;
}
