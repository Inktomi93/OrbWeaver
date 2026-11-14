import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { rowVariants } from "./variants.ts";

export interface InlineListProps extends ComponentProps<"ul">, VariantProps<typeof rowVariants> {}

/** A semantic horizontal list with the same intent-token spacing axes as `Row`. */
export function InlineList({ className, gap, align, justify, padding, paddingInline, paddingBlock, ...props }: InlineListProps): ReactElement {
  // The reset leads, so a padding axis the caller names merges over it instead of being evicted. Each item is a flex box: a control
  // inside a block item sits on a line box, whose strut and the control's own baseline decide the item's height, so two items holding
  // controls of one size could differ by the gap between their baselines.
  return <ul {...props} className={cn("m-0 list-none p-0 *:flex", rowVariants({ gap, align, justify, padding, paddingInline, paddingBlock }), className)} />;
}
