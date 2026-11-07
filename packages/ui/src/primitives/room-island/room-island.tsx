import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { variantProps } from "#lib";
import { roomIslandVariants } from "./variants.ts";

type RoomIslandProps = ComponentProps<"div"> &
  VariantProps<typeof roomIslandVariants> & {
    /** The owner-CSS hook this island is, which also keeps it out of the density tier map: its radius and inset are its own at every tier. */
    readonly ownSlot: string;
  };

/** An island in a room's reading column. It stamps the neutral D336 scope. */
export function RoomIsland({ ownSlot, layout, holdsField, dropTarget, grow, className, ...rest }: RoomIslandProps): ReactElement {
  return <div {...rest} {...variantProps(roomIslandVariants, { layout, holdsField, dropTarget, grow }, className, "neutral")} data-slot={ownSlot} />;
}
