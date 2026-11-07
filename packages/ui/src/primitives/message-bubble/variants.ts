import { MESSAGE_BUBBLE_BOX, MESSAGE_BUBBLE_FILL, RECEDED, SELF, tv, WIDTH } from "#lib";
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
    // How the transcript's card lays out its content: `weld` seats the body beside its portrait, `stack` runs it down the card.
    flow: { stack: "flex flex-col", weld: "flex flex-row items-start" },
    // The whole box at the receded step, fill and ink together.
    receded: { true: RECEDED, false: "" },
    artDecoration: ART_DECORATION,
    // A Bubble card takes its share of the column, never past the reading measure.
    share: { true: "max-inline-(--reading-bubble-share-cap)", false: "" },
    // The skin's corner set. `speech` is a Bubble card: a small corner and a long one on the side of the speaker's chip,
    // mirrored for the user. `pill` is a Tide paragraph.
    corners: {
      card: "",
      speechAssistant: "rounded-ss-bubble-sharp rounded-se-bubble-round rounded-ee-bubble-round rounded-es-bubble-tail",
      speechUser: "rounded-ss-bubble-round rounded-se-bubble-sharp rounded-ee-bubble-tail rounded-es-bubble-round",
      pill: "rounded-pill",
    },
    // After the skin's arms: `shape="bubble"` hugs its content, and a card that spans the column overrides that.
    width: { full: WIDTH.full },
    // A card with a row step between its parts, when it holds its own inset.
    gap: { row: "gap-row" },
    self: { end: SELF.end },
    // A card that holds at least the height of its art tile.
    minHeight: { echoCard: "min-block-(--immersive-echo-min-height)" },
  },
  defaultVariants: { shape: "island", padding: "tier", receded: false, share: false, corners: "card" },
});
