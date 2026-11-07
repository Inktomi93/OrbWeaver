import { CONTROL_BLOCK, tv } from "#lib";

// A band names a region in a list pane: the sm height, so it keeps the touch floor, with the tight atom gap and inset.
export const bandButtonVariants = tv({
  base: `${CONTROL_BLOCK.sm} gap-tight px-tight text-label leading-label`,
});
