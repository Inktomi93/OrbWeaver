import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cornerVariants } from "./variants.ts";

type CornerProps = ComponentProps<"span"> & VariantProps<typeof cornerVariants>;

/**
 * A mark (a count, a lock, a dot, a glyph) pinned to its host's block-start, inline-end corner, one `field` step in from the edge.
 * The host is positioned; the mark is the Corner's child, so no primitive carries its own placement.
 */
export function Corner({ className, inset, ...props }: CornerProps): ReactElement {
  return <span {...props} className={cornerVariants({ inset, className })} />;
}
