import { MESSAGE_BUBBLE_BOX, MESSAGE_BUBBLE_FILL, RECEDED, tv } from "#lib";
import { ART_DECORATION } from "../../lib/art-decoration.ts";

// The role's fill with its paired ink, edgeless: the edge colour returns to the ink so a decoration that leaves a side
// at zero width beside the one edge it draws does not mix colours.
export const messageBubbleVariants = tv({
  variants: {
    messageRole: MESSAGE_BUBBLE_FILL,
    // `bubble` is the transcript's own box. `island` is grouped content in a surface (an editor's preview of a message):
    // the island radius and inset, which `tiers.css` resolves from the surface's tier.
    shape: { island: "rounded-base p-block", bubble: MESSAGE_BUBBLE_BOX },
    // The box delegates its inset to its own content (a welded portrait, a pinned band).
    padding: { tier: "", none: "p-0" },
    // The whole box at the receded step, fill and ink together.
    receded: { true: RECEDED, false: "" },
    artDecoration: ART_DECORATION,
  },
  defaultVariants: { shape: "island", padding: "tier", receded: false },
});
