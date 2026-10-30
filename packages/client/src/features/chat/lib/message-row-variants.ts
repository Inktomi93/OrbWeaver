// The chatStyle variant map — one MessageRow surface, one `Record<ThemeChatStyle, RowSkin>` dispatch table; adding a
// chatStyle member fails tsc HERE until this table says how it paints. Every field is data the row components turn into
// `@orb/ui` primitive props, never a class string, and never a switch(chatStyle) in message-row.tsx.

import { blobUrl } from "@orb/contracts/assets";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import type { MessageRole } from "@orb/kit/message-role";
import type { StackProps } from "@orb/ui/layout";
import type { BubbleDecoration, BubbleDecorationArgs } from "./art-decorations.ts";
import { echoDecoration, whisperDecoration } from "./art-decorations.ts";
import type { RowAttribution } from "./attribution.ts";
import type { TrackName } from "./chat-track.tsx";
import type { SwipeFoot } from "./pager-chrome.ts";
import { SWIPE_FOOT_ECHO, SWIPE_FOOT_INSIDE, SWIPE_FOOT_TRAIN } from "./pager-chrome.ts";
import type { ActionsRow, PinnedHeader } from "./row-edges.ts";
import { ACTIONS_ONLY, ACTIONS_WITH_IDENTITY, PINNED_BAND, PINNED_CARD, PINNED_TRAIN } from "./row-edges.ts";

/** How a row renders its identity art. `sticky-portrait` (Ripple) replaces the sibling avatar chip;
 *  `icon-left` keeps it, even for modes whose bubbleDecoration paints separate art. */
const AVATAR_TREATMENTS = ["icon-left", "sticky-portrait", "none"] as const;
type AvatarTreatment = (typeof AVATAR_TREATMENTS)[number];

const BUBBLE_LAYOUTS = ["single", "trains"] as const;
/** `trains` (Tide) splits the body into per-paragraph bubbles; every other mode is `single`. */
type BubbleLayout = (typeof BUBBLE_LAYOUTS)[number];

const HEADER_PLACEMENTS = ["inside", "outside"] as const;
/** WHERE THIS SKIN PUTS ITS SPEAKER HEADER (#288, owner raised three times over 2026-08-19).
 *
 *  `inside` — name · timestamp · actions are the CONTAINER's own header row, the first child inside the
 *  box the prose renders in. `outside` — the pre-#288 anatomy: a sibling row above the container, backed
 *  by its own chrome plate (`WALLPAPER_PLATE.chrome`) over art.
 *
 *  THE DEFECT THIS AXIS EXISTS FOR is one mechanism with two arms, and naming it here is why the axis is
 *  per-skin rather than global. A row reads as TWO objects whenever the body carries a backing and the
 *  header carries a DIFFERENT one:
 *    · the filled skins (bubble/echo/whisper/ripple — `box: "bubble"`) paint `--color-ai-bubble` /
 *      `--color-user-bubble` in EVERY room, so their header always sat on bare background above a filled
 *      box (the owner's two "Orb bubble" captures, 50% and 100% chat width);
 *    · the no-fill skins (flat/hush/document) have no box at rest — genuinely attached, by proximity —
 *      but over a wallpaper the body takes the reading plate and the header takes the CHIP, which
 *      is the same two-plate split arriving through the art arm. That is why the fix is not "the bubble
 *      family": the owner's "the split thing in chat wasn't just bubbles" is mechanically right.
 *  The polarity report (#288 round 1: "dark reads fine, light reads separated") is this seen from one
 *  side — the chip dissolves into a dark room's plate and goes crisp over a light/art one.
 *
 *  `outside` therefore survives for exactly ONE skin: `tide`, whose `bubbleLayout: "trains"` renders N
 *  per-paragraph pills and has no single container to be inside. Its ST reference agrees (the name sits
 *  above the train), so it is parity, not a concession.
 *
 *  It is a REQUIRED field: a new chatStyle fails tsc here until it decides where its speaker goes, the
 *  same enforcement `avatarTreatment`/`bubbleLayout` carry. */
// NOT exported: a consumer reads it off the table it belongs to (`RowSkin["headerPlacement"]`), the same
// way `avatarTreatment`'s return type is reached. An exported alias here would be a second home for a
// shape the skin table already owns, which `no-inline-types` reds.
type HeaderPlacement = (typeof HEADER_PLACEMENTS)[number];

const COLUMN_PLACEMENTS = ["anchored", "gutterCentred"] as const;
/** WHERE THIS SKIN SEATS THE READING COLUMN AGAINST THE IDENTITY GUTTER (#1728 arm B, owner 2026-09-05).
 *
 *  `anchored` — the row body is a flex line and the gutter is part of it, so the pair (chip + column) is
 *  placed as one unit against the track's leading or trailing edge. Right for the BUBBLE family, whose rows
 *  are deliberately edge-anchored: there the 40px chip + 8px gap is the shape, not an annotation, and the
 *  `dimension.shell-content-floor` derivation spends it as a term.
 *
 *  `gutterCentred` — the reading COLUMN is centred on its own and the chip hangs beside it in the margin, so
 *  toggling `appearance.showInChatAvatars` no longer slides the prose sideways. Right for the CENTRED skins
 *  (`flat`/`hush` via `flatOuter`, and `document`), which centre their capped column inside the track: with
 *  the chip inside the centred unit the measured prose sat 285px from the left of a 1280px row and 245px
 *  from the right, and went symmetric 265/265 the moment avatars were switched off — a 20px slide on a
 *  toggle. Rides `@orb/ui`'s `Grid cols="gutterCentred"`; the avatar stays a SIBLING of the column (§B.1 is
 *  intact — only the placement mechanism changed, never the anatomy).
 *
 *  A REQUIRED field, like `headerPlacement` and `avatarTreatment`: a new chatStyle fails tsc here until it
 *  says how its column is seated. */
type ColumnPlacement = (typeof COLUMN_PLACEMENTS)[number];

const MESSAGE_BOXES = ["bubble", "plate", "page"] as const;
/** The box the prose renders in. `bubble` is the role's filled card. `plate` (flat) has no fill at rest and takes
 *  the reading plate over a wallpaper, inset a section from its gutter. `page` (stock document) is a full-track page with
 *  the gutter inset, the reading ink and the same plate. */
type MessageBox = (typeof MESSAGE_BOXES)[number];

const ROW_ALIGNS = ["role", "start", "center"] as const;
/** How the row seats its body in the track: `role` puts a user row at the trailing edge, `center` centres the unit. */
type RowAlign = (typeof ROW_ALIGNS)[number];

export interface RowSkin {
  /** The track the row rides (`Track`, chat-track.tsx): the room's own, or echo's, which adds its art pane. */
  readonly track: Extract<TrackName, "chat" | "echo">;
  readonly rowAlign: RowAlign;
  /** {@link ColumnPlacement} — how this skin seats the reading column against the identity gutter (#1728). */
  readonly columnPlacement: ColumnPlacement;
  readonly box: MessageBox;
  /** On a phone a bubble takes at most four fifths of its column, so the other side reads as the other speaker's. */
  readonly phoneCap: boolean;
  readonly avatarTreatment: (kind: RowAttribution["kind"]) => AvatarTreatment;
  /** The transcript's last row keeps a minimum block size (stock document). */
  readonly lastRowFloor: boolean;
  readonly bubbleDecoration?: (args: BubbleDecorationArgs) => BubbleDecoration | null;
  readonly bubbleLayout: BubbleLayout;
  /** {@link HeaderPlacement} — where this skin's speaker/timestamp/actions row lives (#288). */
  readonly headerPlacement: HeaderPlacement;
  /** Whether a USER row mirrors to the trailing edge, chip and all (Moonlit Echoes: bubble, echo, tide). */
  readonly mirrorUser: boolean;
  readonly swipeFoot: SwipeFoot;
  /** The header bar's paint while pinned: the row's own surface, reaching its edges (row-edges.ts). */
  readonly pinnedHeader: PinnedHeader;
  /** What the header bar carries: the speaker and the actions, or the actions alone. */
  readonly actionsRow: ActionsRow;
  /** Illustrated columns reserve the prose measure plus their art pane. */
  readonly columnMeasure?: StackProps["columnMeasure"];
}

const iconLeftTreatment = (): AvatarTreatment => "icon-left";

// RIPPLE WELDS BOTH ROLES (#212-4). It used to weld the portrait for `character` rows only, so a user row
// fell back to an ordinary right-aligned bubble with a 32px chip — i.e. ripple's user rows were `bubble`,
// and half the transcript was not in the skin the reader chose. The reference gives both roles the same
// card + big portrait, and the weld already has a mirrored user arm (`renderRowAvatar`'s `cardCorners`),
// so this is the treatment finally reaching the role it was written for. `null` (a system/unattributed row)
// has no identity to weld and keeps the chip path, which renders nothing for it anyway.
function rippleAvatarTreatment(kind: RowAttribution["kind"]): AvatarTreatment {
  return kind === null ? "icon-left" : "sticky-portrait";
}

function hushDecoration(): BubbleDecoration {
  return { treatment: "stripeStart" };
}

/** The exhaustive chatStyle → skin table; a new chatStyle fails to compile without a row here. */
export const MESSAGE_ROW_SKINS: Record<ThemeChatStyle, RowSkin> = {
  bubble: {
    track: "chat",
    rowAlign: "role",
    columnPlacement: "anchored",
    box: "bubble",
    phoneCap: true,
    lastRowFloor: false,
    avatarTreatment: iconLeftTreatment,
    bubbleLayout: "single",
    headerPlacement: "inside",
    swipeFoot: SWIPE_FOOT_INSIDE,
    pinnedHeader: PINNED_CARD,
    actionsRow: ACTIONS_WITH_IDENTITY,
    mirrorUser: true,
  },
  flat: {
    track: "chat",
    rowAlign: "center",
    columnPlacement: "gutterCentred",
    box: "plate",
    phoneCap: false,
    lastRowFloor: false,
    avatarTreatment: iconLeftTreatment,
    bubbleLayout: "single",
    // No box at rest: inside, the header shares the body's plate over art and the body's own inset.
    headerPlacement: "inside",
    swipeFoot: SWIPE_FOOT_INSIDE,
    pinnedHeader: PINNED_BAND,
    actionsRow: ACTIONS_WITH_IDENTITY,
    mirrorUser: false,
  },
  document: {
    track: "chat",
    rowAlign: "center",
    columnPlacement: "gutterCentred",
    // Stock SillyTavern's document: a full-track page with no reading cap, no avatar, name or timestamp, user
    // and character rows identical, the text inset as stock insets it.
    box: "page",
    phoneCap: false,
    avatarTreatment: () => "none",
    lastRowFloor: true,
    bubbleLayout: "single",
    headerPlacement: "inside",
    swipeFoot: SWIPE_FOOT_INSIDE,
    pinnedHeader: PINNED_BAND,
    actionsRow: ACTIONS_ONLY,
    mirrorUser: false,
  },
  echo: {
    track: "echo",
    rowAlign: "role",
    columnPlacement: "anchored",
    box: "bubble",
    phoneCap: false,
    lastRowFloor: false,
    avatarTreatment: iconLeftTreatment,
    bubbleDecoration: echoDecoration,
    bubbleLayout: "single",
    columnMeasure: "illustrated",
    // Inside, not above the card as the reference has it: a filled container with its header outside
    // reads as two objects, which the attachment ruling outranks.
    headerPlacement: "inside",
    swipeFoot: SWIPE_FOOT_ECHO,
    pinnedHeader: PINNED_CARD,
    actionsRow: ACTIONS_WITH_IDENTITY,
    mirrorUser: true,
  },
  whisper: {
    track: "chat",
    rowAlign: "start",
    columnPlacement: "anchored",
    box: "bubble",
    phoneCap: false,
    lastRowFloor: false,
    avatarTreatment: iconLeftTreatment,
    bubbleDecoration: (args) => whisperDecoration(args, ROLE_FILL[args.role]),
    bubbleLayout: "single",
    // Below the band rather than over the art as the reference has it: the band is a real block child so
    // text never sits on art, and below it the card still reads as one container.
    headerPlacement: "inside",
    swipeFoot: SWIPE_FOOT_INSIDE,
    pinnedHeader: PINNED_CARD,
    actionsRow: ACTIONS_WITH_IDENTITY,
    mirrorUser: false,
  },
  hush: {
    track: "chat",
    rowAlign: "center",
    columnPlacement: "gutterCentred",
    box: "bubble",
    phoneCap: false,
    lastRowFloor: false,
    avatarTreatment: iconLeftTreatment,
    bubbleDecoration: hushDecoration,
    bubbleLayout: "single",
    // Inside puts the header beside the speaker stripe, not under it.
    headerPlacement: "inside",
    swipeFoot: SWIPE_FOOT_INSIDE,
    pinnedHeader: PINNED_CARD,
    actionsRow: ACTIONS_WITH_IDENTITY,
    mirrorUser: false,
  },
  ripple: {
    track: "chat",
    rowAlign: "start",
    columnPlacement: "anchored",
    box: "bubble",
    phoneCap: false,
    lastRowFloor: false,
    avatarTreatment: rippleAvatarTreatment,
    bubbleLayout: "single",
    // The welded portrait sits inside the bubble, so the header lands in the card beside it, a titled panel.
    headerPlacement: "inside",
    swipeFoot: SWIPE_FOOT_INSIDE,
    pinnedHeader: PINNED_CARD,
    actionsRow: ACTIONS_WITH_IDENTITY,
    mirrorUser: false,
  },
  tide: {
    track: "chat",
    rowAlign: "role",
    columnPlacement: "anchored",
    box: "bubble",
    phoneCap: false,
    lastRowFloor: false,
    avatarTreatment: iconLeftTreatment,
    bubbleLayout: "trains",
    // THE ONE `outside`, and not a concession: a train is N per-paragraph pills with no single container
    // to be inside, and ST's tide reference also names the speaker above the train. It therefore keeps
    // the sibling row AND the #167 chip — over art there is nothing else to back it.
    headerPlacement: "outside",
    swipeFoot: SWIPE_FOOT_TRAIN,
    pinnedHeader: PINNED_TRAIN,
    actionsRow: ACTIONS_WITH_IDENTITY,
    mirrorUser: true,
  },
};

/** A role's bubble fill by the name `@orb/ui` gives it: a bubble `Card`'s `tone`, and the `ground` of a band inside one. */
export const ROLE_FILL = { user: "userBubble", assistant: "bubble", system: "systemBubble" } as const satisfies Record<MessageRole, string>;

// The avatar-chip src props live beside the other per-skin asset-URL shaping (Echo portrait, Whisper
// banner) — one home for "which blob variant does this rendering slot request".
// exactOptionalPropertyTypes idiom: omit `src` rather than pass undefined.
export function avatarSrcProp(avatarHash: string | null): { src?: string } {
  return avatarHash === null ? {} : { src: blobUrl(avatarHash) };
}
