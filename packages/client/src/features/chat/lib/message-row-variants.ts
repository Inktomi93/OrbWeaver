// The chatStyle variant map — one MessageRow surface, one `Record<ThemeChatStyle, RowSkin>` dispatch table;
// adding a chatStyle member fails tsc HERE until this table says how it paints. Immersive modes
// (echo/whisper/hush/ripple/tide) extend RowSkin with data fields the row reads — never a switch(chatStyle)
// in message-row.tsx. Echo/Whisper's feather is a layered background-image gradient, not literal
// `mask-image` (that would also fade the text painted on top).

import type { VariantKind } from "@orb/contracts/assets";
import { blobBannerUrl, blobPortraitUrl, blobUrl } from "@orb/contracts/assets";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import type { MessageRole } from "@orb/kit/message-role";
import type { CSSProperties } from "react";
import { cn, messageBubbleClass } from "#lib";
import type { RowAttribution } from "./attribution.ts";
import { BUBBLE_PHONE_CAP, CHAT_TRACK } from "./chat-track.ts";
import { BG_PHOTO_READING_PLATE } from "./message-row-backing.ts";
import type { SwipeFoot } from "./pager-chrome.ts";
import { SWIPE_FOOT_ECHO, SWIPE_FOOT_INSIDE, SWIPE_FOOT_TRAIN } from "./pager-chrome.ts";
import type { ActionsRow, PinnedHeader } from "./row-edges.ts";
import { ACTIONS_ONLY, ACTIONS_WITH_IDENTITY, PINNED_BAND, PINNED_CARD, PINNED_CHIP, PINNED_PILL } from "./row-edges.ts";

function alignFor(role: MessageRole): string {
  return role === "user" ? "items-end" : "items-start";
}

// `cn` is typed `string | undefined` (never undefined at runtime); coalesce so each skin returns `string`.
const cx = (...args: Parameters<typeof cn>): string => cn(...args) ?? "";

/** How a row renders its identity art. `sticky-portrait` (Ripple) replaces the sibling avatar chip;
 *  `icon-left` keeps it, even for modes whose bubbleDecoration paints separate art. */
const AVATAR_TREATMENTS = ["icon-left", "sticky-portrait", "none"] as const;
type AvatarTreatment = (typeof AVATAR_TREATMENTS)[number];

/** `trains` (Tide) splits the body into per-paragraph bubbles; every other mode is `single`. */
type BubbleLayout = "single" | "trains";

/** WHERE THIS SKIN PUTS ITS SPEAKER HEADER (#288, owner raised three times over 2026-08-19).
 *
 *  `inside` — name · timestamp · actions are the CONTAINER's own header row, the first child inside the
 *  box the prose renders in. `outside` — the pre-#288 anatomy: a sibling row above the container, backed
 *  by its own `BG_PHOTO_CHROME_PLATE` chip over art.
 *
 *  THE DEFECT THIS AXIS EXISTS FOR is one mechanism with two arms, and naming it here is why the axis is
 *  per-skin rather than global. A row reads as TWO objects whenever the body carries a backing and the
 *  header carries a DIFFERENT one:
 *    · the filled skins (bubble/echo/whisper/ripple — `inner: bubbleInner`) paint `--color-ai-bubble` /
 *      `--color-user-bubble` in EVERY room, so their header always sat on bare background above a filled
 *      box (the owner's two "Orb bubble" captures, 50% and 100% chat width);
 *    · the no-fill skins (flat/hush/document) have no box at rest — genuinely attached, by proximity —
 *      but over a wallpaper the body takes `BG_PHOTO_READING_PLATE` and the header takes the CHIP, which
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
type HeaderPlacement = "inside" | "outside";

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
type ColumnPlacement = "anchored" | "gutterCentred";

/** Input to a mode's `bubbleDecoration`. The avatar HASH, not a prebuilt URL — each decorator requests
 *  its own correctly-shaped variant (Echo → blobPortraitUrl, Whisper → blobBannerUrl).
 */
export interface BubbleDecorationArgs {
  readonly kind: RowAttribution["kind"];
  readonly avatarHash: string | null;
  /** Static illustration consumers resolve their own art; absent keeps the owned-blob path. */
  readonly imageUrlFor?: (variant: VariantKind, width?: number) => string;
  /** THE `appearance.showInChatAvatars` TOGGLE, threaded to the decorators (#212-6). It used to reach only
   *  `renderRowAvatar`, so the toggle meant three different things across the eight skins: six removed the
   *  chip, ripple lost its whole identity (its portrait IS an avatarTreatment), and echo/whisper ignored it
   *  entirely — a reader who turned avatars off still got a screen dominated by character art in two of
   *  eight modes. One concept, one behaviour: the toggle governs ALL identity art, chip and immersive
   *  alike. A decorator that paints CHROME rather than identity (hush's speaker stripe, whisper's stripe)
   *  is unaffected — it is not art of anybody. */
  readonly showInChatAvatars: boolean;
}

/** Extra inline paint for the bubble box, layered over the existing `skin.inner(role)` skin. */
export interface BubbleDecoration {
  readonly style?: CSSProperties;
  /** Whisper's header-art band, rendered as a real block-level child above the bubble text (never a
   *  background layer, which would let text sit on bright art). */
  readonly headerBand?: { readonly style: CSSProperties; readonly className: string } | undefined;
  /** Echo's art pane: a positioned tile on the side the art sits (the role mirror, #212-3), cover-cropped
   *  and faded by its own mask. A tile and not a background layer so a phone can give it Moonlit's fixed
   *  mobile height while it stays cropped to its pane. */
  readonly art?: { readonly style: CSSProperties; readonly side: "left" | "right" } | undefined;
}

export interface RowSkin {
  readonly outer: (role: MessageRole) => string;
  /** {@link ColumnPlacement} — how this skin seats the reading column against the identity gutter (#1728). */
  readonly columnPlacement: ColumnPlacement;
  readonly inner: (role: MessageRole) => string;
  readonly avatarTreatment: (kind: RowAttribution["kind"]) => AvatarTreatment;
  /** The last row's extra inner class (stock document keeps a minimum block size there). */
  readonly lastRowInner?: string;
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
  /** A SKIN-OWNED override of the content column's width, as an inline style (#212-2). The styles tier caps
   *  that column at the reading measure — a rule about a column that holds PROSE. Echo's column holds prose
   *  AND an art pane, so capping the two together is what squeezed its line to 28 characters: the cap has to
   *  grow by exactly the art it also has to carry. Inline because the cap lives in an unlayered sheet rule
   *  that a utility class cannot outrank. Absent for every skin whose column is prose and nothing else. */
  readonly columnStyle?: CSSProperties;
}

function bubbleOuter(role: MessageRole): string {
  return cx(CHAT_TRACK, alignFor(role));
}
// Filled skins share the role-bubble recipe; centered unboxed skins own their reading treatment.
const bubbleInner = messageBubbleClass;
// The full-width skins take the SAME centred track as the bubble family (#213), and CENTRE their capped
// column inside it. They used to carry a bare `w-full items-stretch`: the track was the whole pane (a
// 686px reading column pinned to the left edge of a 1404px pane, 718px of dead wallpaper on its right)
// while the composer under it centred — and `items-stretch` then re-pinned the column to the track's left
// edge, leaving whatever the reading measure did not spend as dead space on ONE side. `items-center` is
// what `document` has always done, and it is why the parity pass called document "the only skin that
// centres its capped column". The row's anatomy is untouched: the body still holds the avatar gutter and
// the column, it is simply placed as a unit.
function flatOuter(): string {
  return cx(CHAT_TRACK, "items-center");
}
function flatInner(role: MessageRole): string {
  // The plate constant carries the paired reading ink (#204 derive law); a system row keeps its muted
  // tone in BOTH arms — the second spelling out-cascades the plate's `in-data-…:text-prose-body` (same
  // variant, later in the merge), the first covers the plain-background arm.
  // On a phone the text sits a stock 10px from the avatar (SillyTavern flat), not a desktop section away.
  return cx(
    "w-full px-section py-row @max-md:px-row",
    BG_PHOTO_READING_PLATE,
    role === "system" && "text-muted-foreground in-data-[has-bg-image]:text-muted-foreground",
  );
}
const iconLeftTreatment = (): AvatarTreatment => "icon-left";

// RIPPLE WELDS BOTH ROLES (#212-4). It used to weld the portrait for `character` rows only, so a user row
// fell back to an ordinary right-aligned bubble with a 32px chip — i.e. ripple's user rows were `bubble`,
// and half the transcript was not in the skin the reader chose. The reference gives both roles the same
// card + big portrait, and the weld already has a mirrored user arm (`renderRowAvatar`'s `weldRounding`),
// so this is the treatment finally reaching the role it was written for. `null` (a system/unattributed row)
// has no identity to weld and keeps the chip path, which renders nothing for it anyway.
function rippleAvatarTreatment(kind: RowAttribution["kind"]): AvatarTreatment {
  return kind === null ? "icon-left" : "sticky-portrait";
}

/** Hush's speaker-color left stripe — chrome, not portrait art, so it paints for every kind. */
const STRIPE_LEFT: CSSProperties = {
  borderLeftWidth: "var(--immersive-stripe-width)",
  borderLeftStyle: "solid",
  borderLeftColor: "var(--color-speaker)",
};
function hushDecoration(): BubbleDecoration {
  return { style: STRIPE_LEFT };
}

const ECHO_PORTRAIT_REQUEST_WIDTH = 400;

// The full art reservation is additive to the prose measure when the row has room.
// On narrow rows the art shares that row's budget, leaving room for header and pager targets.
const ECHO_MAX_WIDTH_STYLE: CSSProperties = {
  maxWidth: "min(100%, calc(var(--reading-measure-min) + var(--immersive-echo-art-width) + var(--spacing-block)))",
};

// ECHO'S TRACK IS THE SHARED TRACK PLUS ITS ART PANE. A max-width only ALLOWS width — the column is a flex
// child, so what it can actually occupy is what the track hands the row. Inside the plain track the art
// went straight back to eating the line (measured: 436px of prose, 51ch). The art is ADDITIVE by
// declaration: the reader's `chatWidthPct` dial still sets how wide the READING runs, and this skin says
// its portrait pane costs extra room on top of it. Still `mx-auto`, so the row centres on the same axis as
// the composer (#213 asserts the axis, never equal widths), and still `w-full`, so a pane narrower than
// the ask degrades to the pane instead of overflowing it.
const ECHO_TRACK = "mx-auto w-full orb-echo-track";

function echoOuter(role: MessageRole): string {
  return cx(ECHO_TRACK, alignFor(role));
}
const ECHO_ART_WIDTH = "min(var(--immersive-echo-art-width), 25cqi)";

/** The art side: a character speaks from the row's leading edge, the viewer's persona from its trailing
 *  one, exactly as the reference mirrors the two roles. */
function echoArtSide(kind: RowAttribution["kind"]): "left" | "right" {
  return kind === "persona" ? "left" : "right";
}

function echoDecoration(args: BubbleDecorationArgs): BubbleDecoration | null {
  // No identity, or the reader turned identity art off (#212-6) ⇒ echo paints no art at all. The bubble
  // keeps its ordinary box, so the row degrades to a clean card rather than a card with a hole in it.
  if (args.kind === null || !args.showInChatAvatars) {
    return null;
  }
  const portraitUrl =
    args.imageUrlFor?.("portrait", ECHO_PORTRAIT_REQUEST_WIDTH) ??
    (args.avatarHash === null ? null : blobPortraitUrl(args.avatarHash, ECHO_PORTRAIT_REQUEST_WIDTH));
  // No portrait image: a clean card. A giant letter tile beside the row's own letter chip said nothing.
  if (portraitUrl === null) {
    return null;
  }
  const side = echoArtSide(args.kind);
  // The art side's inset is the pane, and the header bar and swipe foot reach across it (`--row-reach-*`).
  const inset: CSSProperties = side === "left" ? { paddingLeft: ECHO_ART_WIDTH } : { paddingRight: ECHO_ART_WIDTH };
  const toward = side === "left" ? "right" : "left";
  return {
    style: { ...ECHO_MAX_WIDTH_STYLE, ...inset, [`--row-reach-${side}`]: ECHO_ART_WIDTH } as CSSProperties,
    art: {
      side,
      style: {
        width: ECHO_ART_WIDTH,
        backgroundImage: `url("${portraitUrl}")`,
        // Moonlit's feather: the art dissolves into the card toward the text and at its foot.
        maskImage: `linear-gradient(to ${toward}, black 70%, transparent), linear-gradient(to bottom, black 60%, transparent)`,
        maskComposite: "intersect",
      },
    },
  };
}

const WHISPER_BANNER_REQUEST_WIDTH = 800;
// Moonlit Echoes' Glimmer preset: the banner is half the card, centred; a phone widens it to 55%.
const WHISPER_BAND_WIDTH = "mx-auto w-1/2 @max-md:w-11/20";

const WHISPER_STRIPE: CSSProperties = {
  borderTopWidth: "var(--immersive-stripe-width)",
  borderTopStyle: "solid",
  borderTopColor: "var(--color-speaker)",
};

// The band is a real block-level child (not a background layer) so background-size:cover has a stable
// box to crop against and text can never sit on the art. aspect-ratio derives its height from the
// bubble's fluid width so the box always matches the server's 3:1 crop.
function whisperDecoration(args: BubbleDecorationArgs): BubbleDecoration {
  // The speaker STRIPE is chrome (a colour tick, not a portrait), so it survives an avatars-off reader;
  // the BAND is identity art and does not (#212-6). Both roles get it: a persona's banner is its image here
  // as a character's is (owner ruling, as Moonlit Echoes paints both), with the same hue-tile fallback.
  if (args.kind === null || !args.showInChatAvatars) {
    return { style: WHISPER_STRIPE };
  }
  const bannerUrl =
    args.imageUrlFor?.("banner", WHISPER_BANNER_REQUEST_WIDTH) ??
    (args.avatarHash === null ? null : blobBannerUrl(args.avatarHash, WHISPER_BANNER_REQUEST_WIDTH));
  // No banner image: the stripe alone. A tinted strip with a small letter was a placeholder, not identity.
  if (bannerUrl === null) {
    return { style: WHISPER_STRIPE };
  }
  return {
    style: WHISPER_STRIPE,
    headerBand: {
      className: WHISPER_BAND_WIDTH,
      style: {
        aspectRatio: "var(--aspect-banner)",
        backgroundImage: `linear-gradient(to bottom, transparent, var(--color-ai-bubble) var(--immersive-whisper-feather)), url("${bannerUrl}")`,
        backgroundSize: "100% 100%, cover",
        backgroundPosition: "0 0, top center",
        backgroundRepeat: "no-repeat, no-repeat",
      },
    },
  };
}

/** The exhaustive chatStyle → skin table; a new chatStyle fails to compile without a row here. */
export const MESSAGE_ROW_SKINS: Record<ThemeChatStyle, RowSkin> = {
  bubble: {
    outer: bubbleOuter,
    columnPlacement: "anchored",
    inner: (role) => cx(bubbleInner(role), BUBBLE_PHONE_CAP),
    avatarTreatment: iconLeftTreatment,
    bubbleLayout: "single",
    headerPlacement: "inside",
    swipeFoot: SWIPE_FOOT_INSIDE,
    pinnedHeader: PINNED_CARD,
    actionsRow: ACTIONS_WITH_IDENTITY,
    mirrorUser: true,
  },
  flat: {
    outer: flatOuter,
    columnPlacement: "gutterCentred",
    inner: flatInner,
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
    outer: () => cx(CHAT_TRACK, "items-center"),
    columnPlacement: "gutterCentred",
    // Stock SillyTavern's document: a full-track page with no reading cap, no avatar, name or timestamp, user
    // and character rows identical, the text inset as stock insets it.
    inner: () => cx("w-full pt-row pl-gutter pr-gutter text-prose-body", BG_PHOTO_READING_PLATE),
    avatarTreatment: () => "none",
    lastRowInner: "min-h-(--immersive-document-last-row-min-height)",
    bubbleLayout: "single",
    headerPlacement: "inside",
    swipeFoot: SWIPE_FOOT_INSIDE,
    pinnedHeader: PINNED_CHIP,
    actionsRow: ACTIONS_ONLY,
    mirrorUser: false,
  },
  echo: {
    outer: echoOuter,
    columnPlacement: "anchored",
    inner: bubbleInner,
    avatarTreatment: iconLeftTreatment,
    bubbleDecoration: echoDecoration,
    bubbleLayout: "single",
    columnStyle: ECHO_MAX_WIDTH_STYLE,
    // Inside, not above the card as the reference has it: a filled container with its header outside
    // reads as two objects, which the attachment ruling outranks.
    headerPlacement: "inside",
    swipeFoot: SWIPE_FOOT_ECHO,
    pinnedHeader: PINNED_CARD,
    actionsRow: ACTIONS_WITH_IDENTITY,
    mirrorUser: true,
  },
  whisper: {
    outer: () => bubbleOuter("assistant"),
    columnPlacement: "anchored",
    inner: bubbleInner,
    avatarTreatment: iconLeftTreatment,
    bubbleDecoration: whisperDecoration,
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
    outer: flatOuter,
    columnPlacement: "gutterCentred",
    inner: flatInner,
    avatarTreatment: iconLeftTreatment,
    bubbleDecoration: hushDecoration,
    bubbleLayout: "single",
    // Inside puts the header beside the speaker stripe, not under it.
    headerPlacement: "inside",
    swipeFoot: SWIPE_FOOT_INSIDE,
    pinnedHeader: PINNED_BAND,
    actionsRow: ACTIONS_WITH_IDENTITY,
    mirrorUser: false,
  },
  ripple: {
    outer: () => bubbleOuter("assistant"),
    columnPlacement: "anchored",
    inner: bubbleInner,
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
    outer: bubbleOuter,
    columnPlacement: "anchored",
    inner: bubbleInner,
    avatarTreatment: iconLeftTreatment,
    bubbleLayout: "trains",
    // THE ONE `outside`, and not a concession: a train is N per-paragraph pills with no single container
    // to be inside, and ST's tide reference also names the speaker above the train. It therefore keeps
    // the sibling row AND the #167 chip — over art there is nothing else to back it.
    headerPlacement: "outside",
    swipeFoot: SWIPE_FOOT_TRAIN,
    pinnedHeader: PINNED_PILL,
    actionsRow: ACTIONS_WITH_IDENTITY,
    mirrorUser: true,
  },
};

// The avatar-chip src props live beside the other per-skin asset-URL shaping (Echo portrait, Whisper
// banner) — one home for "which blob variant does this rendering slot request".
// exactOptionalPropertyTypes idiom: omit `src` rather than pass undefined.
export function avatarSrcProp(avatarHash: string | null): { src?: string } {
  return avatarHash === null ? {} : { src: blobUrl(avatarHash) };
}

const RIPPLE_PORTRAIT_REQUEST_WIDTH = 200;

export function avatarPortraitSrcProp(avatarHash: string | null): { src?: string } {
  return avatarHash === null ? {} : { src: blobPortraitUrl(avatarHash, RIPPLE_PORTRAIT_REQUEST_WIDTH) };
}
