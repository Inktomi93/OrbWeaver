import { tv } from "#lib";

// The avatar-stack skin — a flex row of overlapping `<Avatar>`s (contract §6.1 item 9). The ring
// is the overlap SEPARATOR (each avatar's edge reads clean against the next), not a color signal.
// Per-item overlap offset is geometry, not a styling axis — see avatar-stack.tsx's OVERLAP_PX
// table (the icons/icon.tsx ICON_* precedent) — so it stays out of this variant entirely.
export const avatarStackVariants = tv({
  slots: {
    root: "flex items-center",
    item: "shrink-0 ring-2 ring-background",
  },
});
