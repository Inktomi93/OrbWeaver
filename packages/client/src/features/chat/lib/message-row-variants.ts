// The chatStyle variant map — one MessageRow surface, one `Record<ThemeChatStyle, RowSkin>` dispatch table;
// adding a chatStyle member fails tsc HERE until this table says how it paints. Immersive modes
// (echo/whisper/hush/ripple/tide) extend RowSkin with data fields the row reads — never a switch(chatStyle)
// in message-row.tsx. Echo/Whisper's feather is a layered background-image gradient, not literal
// `mask-image` (that would also fade the text painted on top).

import { blobBannerUrl, blobPortraitUrl, blobUrl } from "@orb/contracts/assets";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import type { MessageRole } from "@orb/kit/message-role";
import { avatarFallbackHueColor } from "@orb/ui/avatar";
import type { CSSProperties } from "react";
import { cn, messageBubbleClass } from "#lib";
import type { RowAttribution } from "./attribution.ts";
import { CHAT_TRACK } from "./chat-track.ts";
import { BG_PHOTO_READING_PLATE } from "./message-row-backing.ts";

function alignFor(role: MessageRole): string {
  return role === "user" ? "items-end" : "items-start";
}

// `cn` is typed `string | undefined` (never undefined at runtime); coalesce so each skin returns `string`.
const cx = (...args: Parameters<typeof cn>): string => cn(...args) ?? "";

/** How a row renders its identity art. `sticky-portrait` (Ripple) replaces the sibling avatar chip;
 *  `icon-left` keeps it, even for modes whose bubbleDecoration paints separate art. */
const AVATAR_TREATMENTS = ["icon-left", "sticky-portrait"] as const;
type AvatarTreatment = (typeof AVATAR_TREATMENTS)[number];

/** `trains` (Tide) splits the body into per-paragraph bubbles; every other mode is `single`. */
type BubbleLayout = "single" | "trains";

/** Input to a mode's `bubbleDecoration`. The avatar HASH, not a prebuilt URL — each decorator requests
 *  its own correctly-shaped variant (Echo → blobPortraitUrl, Whisper → blobBannerUrl). */
export interface BubbleDecorationArgs {
  readonly kind: RowAttribution["kind"];
  readonly avatarHash: string | null;
  /** Seed for the deterministic fallback hue tile, used only on the no-image path. */
  readonly hueSeed: string;
  readonly initial: string;
  /** THE `appearance.showInChatAvatars` TOGGLE, threaded to the decorators (#212-6). It used to reach only
   *  `renderRowAvatar`, so the toggle meant three different things across the eight skins: six removed the
   *  chip, ripple lost its whole identity (its portrait IS an avatarTreatment), and echo/whisper ignored it
   *  entirely — a reader who turned avatars off still got a screen dominated by character art in two of
   *  eight modes. One concept, one behaviour: the toggle governs ALL identity art, chip and immersive
   *  alike. A decorator that paints CHROME rather than identity (hush's speaker stripe, whisper's stripe)
   *  is unaffected — it is not art of anybody. */
  readonly showInChatAvatars: boolean;
}

/** Extra className/style for the bubble box — merged onto the existing `skin.inner(role)` classes. */
export interface BubbleDecoration {
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Whisper's header-art band, rendered as a real block-level child above the bubble text (never a
   *  background layer, which would let text sit on bright art). `initial` set only on the no-image fallback. */
  readonly headerBand?: { readonly style: CSSProperties; readonly initial?: string | undefined } | undefined;
  /** Echo's no-avatar fallback edge tile, painting the entity's hue field at the same geometry the
   *  portrait would use — including which SIDE the art pane sits on (the role mirror, #212-3). Absent for
   *  the with-image Echo path and every other mode. */
  readonly edgeTile?: { readonly style: CSSProperties; readonly initial: string; readonly side: "left" | "right" } | undefined;
}

export interface RowSkin {
  readonly outer: (role: MessageRole) => string;
  readonly inner: (role: MessageRole) => string;
  readonly avatarTreatment: (kind: RowAttribution["kind"]) => AvatarTreatment;
  readonly bubbleDecoration?: (args: BubbleDecorationArgs) => BubbleDecoration | null;
  readonly bubbleLayout: BubbleLayout;
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
// The bubble box itself is single-homed in `#lib/messageBubbleClass` — the theme editor's live preview
// paints from the same builder, so the preview and the transcript can never drift apart (side-eye P2,
// 2026-08-01). Inherited by exactly the five bubble-family skins whose `inner: bubbleInner`
// (bubble/echo/whisper/ripple/tide) — flat/document/hush own their own full-width inner and are untouched.
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
  return cx("w-full px-section py-row", BG_PHOTO_READING_PLATE, role === "system" && "text-muted-foreground in-data-[has-bg-image]:text-muted-foreground");
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

// ECHO'S GEOMETRY, REBUILT ON THE MEASURE (#212-2/-3). The art pane is a FIXED column that lives OUTSIDE
// the prose measure, on the row's OUTER side per role — the reference's anatomy, and the only shape that
// keeps both promises at once (art present, line readable).
//
// What it replaced, and why the old shape could not be tuned: the pane was `--immersive-echo-feather: 55%`
// spent as `padding-right` INSIDE the bubble's own `max-w-prose` box. Two defects fell out of that single
// decision. (1) The reading line was whatever the percentage left — 239px of a 558px box = **28 characters
// per line** against the house 65-75ch law (side-eye 2026-08-18). (2) `background-size: cover` sized the
// art against the WHOLE bubble, which grows with the message: a 400x600 portrait painted into a measured
// 558x2965 box is a **4.94x upscale** with 28% of the asset visible and the subject's head off-frame, so
// the longer the turn the less it looked like anybody. Both are gone by construction now:
//   · the box is `--reading-measure-min + --immersive-echo-art-width`, so the PROSE keeps the band's floor
//     and the art is additive — the measure wins over the feather, never the reverse;
//   · the art layer is painted at `<art-width> auto` anchored to the pane's TOP outer corner, so it is
//     DOWN-scaled from its 400px request (the portrait variant's own smart crop does the framing) and a
//     three-screen turn shows the same head as a one-line one.
// The gradient is still a layered background rather than a literal mask (a mask would fade the TEXT too),
// and its stop is now the same art width — the art is fully dissolved exactly where the text may start.
// The box is CONTENT + the art pane + the bubble's own inner inset on the text side (`px-block`, which
// `box-sizing: border-box` counts inside a max-width) — so what survives for prose is exactly the floor.
// The SAME arithmetic caps echo's content column (`ECHO_COLUMN_STYLE`): without that, the styles tier's
// prose-only measure fenced the bubble first and the art went back to eating the line.
const ECHO_BOX_WIDTH = "calc(var(--reading-measure-min)+var(--immersive-echo-art-width)+var(--spacing-block))";
const ECHO_BOX = "max-w-[calc(var(--reading-measure-min)+var(--immersive-echo-art-width)+var(--spacing-block))]";
const ECHO_COLUMN_STYLE: CSSProperties = { maxWidth: ECHO_BOX_WIDTH };

// ECHO'S TRACK IS THE SHARED TRACK PLUS ITS ART PANE. A max-width only ALLOWS width — the column is a flex
// child, so what it can actually occupy is what the track hands the row. Inside the plain track the art
// went straight back to eating the line (measured: 436px of prose, 51ch). The art is ADDITIVE by
// declaration: the reader's `chatWidthPct` dial still sets how wide the READING runs, and this skin says
// its portrait pane costs extra room on top of it. Still `mx-auto`, so the row centres on the same axis as
// the composer (#213 asserts the axis, never equal widths), and still `w-full`, so a pane narrower than
// the ask degrades to the pane instead of overflowing it.
const ECHO_TRACK = "mx-auto w-full max-w-[calc(var(--width-shell-content)+var(--immersive-echo-art-width))]";

function echoOuter(role: MessageRole): string {
  return cx(ECHO_TRACK, alignFor(role));
}
const ECHO_ART_WIDTH = "var(--immersive-echo-art-width)";

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
  const side = echoArtSide(args.kind);
  const padding: CSSProperties = side === "left" ? { paddingLeft: ECHO_ART_WIDTH } : { paddingRight: ECHO_ART_WIDTH };
  // The gradient always fades FROM the art edge INTO the bubble fill, so it mirrors with the pane.
  const fade = `linear-gradient(to ${side === "left" ? "right" : "left"}, transparent, var(--color-ai-bubble) ${ECHO_ART_WIDTH})`;
  if (args.avatarHash === null) {
    return {
      className: ECHO_BOX,
      style: padding,
      edgeTile: {
        initial: args.initial,
        side,
        style: {
          backgroundColor: avatarFallbackHueColor(args.hueSeed),
          backgroundImage: `linear-gradient(to ${side === "left" ? "right" : "left"}, transparent, var(--color-ai-bubble))`,
        },
      },
    };
  }
  const portraitUrl = blobPortraitUrl(args.avatarHash, ECHO_PORTRAIT_REQUEST_WIDTH);
  return {
    className: ECHO_BOX,
    style: {
      ...padding,
      backgroundImage: `${fade}, url("${portraitUrl}")`,
      // The art layer is sized to the PANE (width, natural height) instead of `cover` over the whole
      // bubble — that is the 4.94x upscale fix. Anchored to the pane's top outer corner so the crop keeps
      // the subject at any message height.
      backgroundSize: `100% 100%, ${ECHO_ART_WIDTH} auto`,
      backgroundPosition: `0 0, ${side === "left" ? "left" : "right"} top`,
      backgroundRepeat: "no-repeat, no-repeat",
    },
  };
}

const WHISPER_BANNER_REQUEST_WIDTH = 800;

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
  // the BAND is identity art and does not (#212-6, owner ruling 2026-08-18: the toggle governs all
  // identity art). Whisper used to read `avatarHash` alone and kept its banner either way.
  if (args.kind !== "character" || !args.showInChatAvatars) {
    return { style: WHISPER_STRIPE };
  }
  if (args.avatarHash === null) {
    return {
      style: WHISPER_STRIPE,
      headerBand: {
        initial: args.initial,
        style: {
          aspectRatio: "var(--aspect-banner)",
          backgroundColor: avatarFallbackHueColor(args.hueSeed),
          backgroundImage: "linear-gradient(to bottom, transparent, var(--color-ai-bubble) var(--immersive-whisper-feather))",
        },
      },
    };
  }
  const bannerUrl = blobBannerUrl(args.avatarHash, WHISPER_BANNER_REQUEST_WIDTH);
  return {
    style: WHISPER_STRIPE,
    headerBand: {
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
    inner: bubbleInner,
    avatarTreatment: iconLeftTreatment,
    bubbleLayout: "single",
  },
  flat: {
    outer: flatOuter,
    inner: flatInner,
    avatarTreatment: iconLeftTreatment,
    bubbleLayout: "single",
  },
  document: {
    outer: () => cx(CHAT_TRACK, "items-center"),
    inner: () => cx("w-full max-w-prose px-block py-row text-prose-body", BG_PHOTO_READING_PLATE),
    avatarTreatment: iconLeftTreatment,
    bubbleLayout: "single",
  },
  echo: {
    outer: echoOuter,
    inner: bubbleInner,
    avatarTreatment: iconLeftTreatment,
    bubbleDecoration: echoDecoration,
    bubbleLayout: "single",
    columnStyle: ECHO_COLUMN_STYLE,
  },
  whisper: {
    outer: bubbleOuter,
    inner: bubbleInner,
    avatarTreatment: iconLeftTreatment,
    bubbleDecoration: whisperDecoration,
    bubbleLayout: "single",
  },
  hush: {
    outer: flatOuter,
    inner: flatInner,
    avatarTreatment: iconLeftTreatment,
    bubbleDecoration: hushDecoration,
    bubbleLayout: "single",
  },
  ripple: {
    outer: bubbleOuter,
    inner: bubbleInner,
    avatarTreatment: rippleAvatarTreatment,
    bubbleLayout: "single",
  },
  tide: {
    outer: bubbleOuter,
    inner: bubbleInner,
    avatarTreatment: iconLeftTreatment,
    bubbleLayout: "trains",
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
