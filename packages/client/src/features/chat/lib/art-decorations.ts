// The identity art echo and whisper paint beside and above a row's text: the decorations that describe the art slot
// (its box, its mask or feather, its fallback and the URL it asks for). The slot components render them
// (components/art-slot.tsx); the skin table in message-row-variants.ts picks them per chat style.

import type { VariantKind } from "@orb/contracts/assets";
import { blobBannerUrl, blobPortraitUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import type { MessageRole } from "@orb/kit/message-role";
import { avatarFallbackHueColor } from "@orb/ui/avatar";
import type { CSSProperties } from "react";
import type { RowAttribution } from "./attribution.ts";

/** Input to a mode's `bubbleDecoration`. The avatar HASH, not a prebuilt URL — each decorator requests
 *  its own correctly-shaped variant (Echo → blobPortraitUrl, Whisper → blobBannerUrl).
 */
export interface BubbleDecorationArgs {
  readonly kind: RowAttribution["kind"];
  readonly avatarHash: string | null;
  /** The speaker's name and fallback-hue seed: with no image, the art slot is filled with the same hue and
   *  initial the avatar chip falls back to, so chip and art agree. */
  readonly name: string | null;
  readonly hueSeed: string;
  /** The row's role: whisper's band fades into the row's own bubble colour. */
  readonly role: MessageRole;
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
  readonly headerBand?:
    | {
        readonly style: CSSProperties;
        readonly className: string;
        /** The gradient layer that dissolves the band into the bubble beneath it. */
        readonly feather: string;
        /** The feather over a band with no image to show (none, or one that failed to load): the solid top holds the initial. */
        readonly plainFeather: string;
        /** The speaker's initial, shown when there is no image or it fails to load. */
        readonly fallback: string;
        /** The banner image, asked at the width the band renders; absent when the speaker has none. */
        readonly image?: { readonly urlAt: (cssWidth: number) => string };
      }
    | undefined;
  /** Echo's art pane: a positioned tile on the side the art sits (the role mirror, #212-3), cover-cropped
   *  and faded by its own mask. A tile and not a background layer so a phone can give it Moonlit's fixed
   *  mobile height while it stays cropped to its pane. */
  readonly art?:
    | {
        readonly style: CSSProperties;
        readonly side: "left" | "right";
        /** The speaker's initial, shown when there is no image or it fails to load. */
        readonly fallback: string;
        /** The portrait image, asked at the width the tile renders; absent when the speaker has none. */
        readonly image?: { readonly urlAt: (cssWidth: number) => string };
      }
    | undefined;
}

// Art asks for device pixels, never the CSS box (a CSS-sized ask is soft on dense displays); 3x is where the ladder tops out.
const MAX_ART_PIXEL_RATIO = 3;

export function artRequestWidth(cssWidth: number): number {
  // Read through Reflect: the node-side test program has no DOM lib, so `globalThis.devicePixelRatio` is untyped there.
  const reported: unknown = Reflect.get(globalThis, "devicePixelRatio");
  const ratio = Math.min(Math.max(typeof reported === "number" ? reported : 1, 1), MAX_ART_PIXEL_RATIO);
  return Math.ceil(cssWidth * ratio);
}

/** The URL builder for a speaker's art at a slot's CSS width (times the pixel ratio), or undefined with no image. */
function imageSource(args: BubbleDecorationArgs, variant: "portrait" | "banner"): ((cssWidth: number) => string) | undefined {
  if (args.imageUrlFor !== undefined) {
    const imageUrlFor = args.imageUrlFor;
    return (cssWidth) => imageUrlFor(variant, artRequestWidth(cssWidth));
  }
  const hash = args.avatarHash;
  if (hash === null) {
    return;
  }
  return (cssWidth) => (variant === "portrait" ? blobPortraitUrl(hash, artRequestWidth(cssWidth)) : blobBannerUrl(hash, artRequestWidth(cssWidth)));
}

// The full art reservation is additive to the prose measure when the row has room.
// On narrow rows the art shares that row's budget, leaving room for header and pager targets.
export const ECHO_MAX_WIDTH_STYLE: CSSProperties = {
  maxWidth: "min(100%, calc(var(--reading-measure-min) + var(--immersive-echo-art-width) + var(--spacing-block)))",
};

const ECHO_ART_WIDTH = "min(var(--immersive-echo-art-width), 25cqi)";

/** The art side: a character speaks from the row's leading edge, the viewer's persona from its trailing
 *  one, exactly as the reference mirrors the two roles. */
function echoArtSide(kind: RowAttribution["kind"]): "left" | "right" {
  return kind === "persona" ? "left" : "right";
}

export function echoDecoration(args: BubbleDecorationArgs): BubbleDecoration | null {
  // No identity, or the reader turned identity art off (#212-6) ⇒ echo paints no art at all. The bubble
  // keeps its ordinary box, so the row degrades to a clean card rather than a card with a hole in it.
  if (args.kind === null || !args.showInChatAvatars) {
    return null;
  }
  // With no portrait image the speaker's fallback fills the same tile, and the row drops its letter chip so the
  // letter is not shown twice (`avatarTreatmentFor`). A portrait that fails to load shows the same fallback.
  const urlAt = imageSource(args, "portrait");
  const side = echoArtSide(args.kind);
  // The art side's inset is the pane, and the header bar and swipe foot reach across it (`--row-reach-*`).
  const inset: CSSProperties = side === "left" ? { paddingLeft: ECHO_ART_WIDTH } : { paddingRight: ECHO_ART_WIDTH };
  const toward = side === "left" ? "right" : "left";
  return {
    style: {
      ...ECHO_MAX_WIDTH_STYLE,
      ...inset,
      [`--row-reach-${side}`]: ECHO_ART_WIDTH,
    } as CSSProperties,
    art: {
      side,
      style: {
        width: ECHO_ART_WIDTH,
        backgroundColor: avatarFallbackHueColor(args.hueSeed),
        // Moonlit's feather: the art dissolves into the card toward the text and at its foot.
        maskImage: `linear-gradient(to ${toward}, black 70%, transparent), linear-gradient(to bottom, black 60%, transparent)`,
        maskComposite: "intersect",
      },
      fallback: initialsFor(args.name ?? ""),
      ...(urlAt === undefined ? {} : { image: { urlAt } }),
    },
  };
}

// Moonlit Echoes' Glimmer preset: the banner is half the card, centred; a phone widens it to 55%.
const WHISPER_BAND_WIDTH = "mx-auto w-1/2 @max-md:w-11/20";

const BUBBLE_FILL_VAR: Readonly<Record<MessageRole, string>> = {
  user: "--color-user-bubble",
  assistant: "--color-ai-bubble",
  system: "--color-system-bubble",
};

// The band dissolves into the row's own bubble. A band with no image keeps its solid top, where the initial sits.
function whisperFeather(role: MessageRole, hasImage: boolean): string {
  const fill = BUBBLE_FILL_VAR[role];
  return hasImage
    ? `linear-gradient(to bottom, transparent, var(${fill}) var(--immersive-whisper-feather))`
    : `linear-gradient(to bottom, transparent 55%, var(${fill}))`;
}

const WHISPER_STRIPE: CSSProperties = {
  borderTopWidth: "var(--immersive-stripe-width)",
  borderTopStyle: "solid",
  borderTopColor: "var(--color-speaker)",
};

// The band is a real block-level child (not a background layer) so background-size:cover has a stable
// box to crop against and text can never sit on the art. aspect-ratio derives its height from the
// bubble's fluid width so the box always matches the server's 3:1 crop.
export function whisperDecoration(args: BubbleDecorationArgs): BubbleDecoration {
  // The speaker STRIPE is chrome (a colour tick, not a portrait), so it survives an avatars-off reader;
  // the BAND is identity art and does not (#212-6). Both roles get it: a persona's banner is its image here
  // as a character's is (owner ruling, as Moonlit Echoes paints both), with the same hue-tile fallback.
  if (args.kind === null || !args.showInChatAvatars) {
    return { style: WHISPER_STRIPE };
  }
  const urlAt = imageSource(args, "banner");
  return {
    style: WHISPER_STRIPE,
    headerBand: {
      className: WHISPER_BAND_WIDTH,
      style: { aspectRatio: "var(--aspect-banner)", backgroundColor: avatarFallbackHueColor(args.hueSeed) },
      feather: whisperFeather(args.role, true),
      plainFeather: whisperFeather(args.role, false),
      fallback: initialsFor(args.name ?? ""),
      ...(urlAt === undefined ? {} : { image: { urlAt } }),
    },
  };
}
