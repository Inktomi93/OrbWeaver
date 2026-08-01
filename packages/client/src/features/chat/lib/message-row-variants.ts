// The chatStyle variant map — one MessageRow surface, one `Record<ChatStyle, RowSkin>` dispatch table;
// adding a chatStyle member fails tsc HERE until this table says how it paints. Immersive modes
// (echo/whisper/hush/ripple/tide) extend RowSkin with data fields the row reads — never a switch(chatStyle)
// in message-row.tsx. Echo/Whisper's feather is a layered background-image gradient, not literal
// `mask-image` (that would also fade the text painted on top).

import { blobBannerUrl, blobPortraitUrl } from "@orb/contracts/assets";
import type { MessageRole } from "@orb/kit/message-role";
import { avatarFallbackHueVar } from "@orb/ui/avatar";
import type { THEME_SCOPE_CHAT_STYLES } from "@orb/ui/theme-scope";
import type { CSSProperties } from "react";
import { cn, messageBubbleClass } from "#lib";
import type { RowAttribution } from "./attribution";
import { BG_PHOTO_CHROME_SCRIM, BG_PHOTO_READING_SCRIM } from "./message-row-backing";

type ChatStyle = (typeof THEME_SCOPE_CHAT_STYLES)[number];

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
}

/** Extra className/style for the bubble box — merged onto the existing `skin.inner(role)` classes. */
export interface BubbleDecoration {
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Whisper's header-art band, rendered as a real block-level child above the bubble text (never a
   *  background layer, which would let text sit on bright art). `initial` set only on the no-image fallback. */
  readonly headerBand?: { readonly style: CSSProperties; readonly initial?: string | undefined } | undefined;
  /** Echo's no-avatar fallback edge tile, painting the entity's hue field at the same geometry the
   *  portrait would use. Absent for the with-image Echo path and every other mode. */
  readonly edgeTile?: { readonly style: CSSProperties; readonly initial: string } | undefined;
}

export interface RowSkin {
  readonly outer: (role: MessageRole) => string;
  readonly inner: (role: MessageRole) => string;
  readonly avatarTreatment: (kind: RowAttribution["kind"]) => AvatarTreatment;
  readonly bubbleDecoration?: (args: BubbleDecorationArgs) => BubbleDecoration | null;
  readonly bubbleLayout: BubbleLayout;
  /** Reading-scrim backing for the name/action chrome row, present only for no-fill modes
   *  (flat/hush/document) whose chrome would otherwise float on a raw bg photo. */
  readonly chromeBacking?: string | undefined;
}

function bubbleOuter(role: MessageRole): string {
  return cx("mx-auto w-full max-w-(--width-shell-content)", alignFor(role));
}
// The bubble box itself is single-homed in `#lib/messageBubbleClass` — the theme editor's live preview
// paints from the same builder, so the preview and the transcript can never drift apart (side-eye P2,
// 2026-08-01). Inherited by exactly the five bubble-family skins whose `inner: bubbleInner`
// (bubble/echo/whisper/ripple/tide) — flat/document/hush own their own full-width inner and are untouched.
const bubbleInner = messageBubbleClass;
function flatOuter(): string {
  return "w-full items-stretch";
}
function flatInner(role: MessageRole): string {
  return cx("w-full px-section py-row", BG_PHOTO_READING_SCRIM, role === "system" && "text-muted-foreground");
}
const iconLeftTreatment = (): AvatarTreatment => "icon-left";

function rippleAvatarTreatment(kind: RowAttribution["kind"]): AvatarTreatment {
  return kind === "character" ? "sticky-portrait" : "icon-left";
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

// Shared by both Echo paths (with-image + no-image fallback) so the fallback aligns pixel-for-pixel
// with the tuned with-art case.
const ECHO_TEXT_PADDING: CSSProperties = { paddingRight: "var(--immersive-echo-feather)" };

function echoDecoration(args: BubbleDecorationArgs): BubbleDecoration | null {
  if (args.kind !== "character") {
    return null;
  }
  if (args.avatarHash === null) {
    return {
      style: ECHO_TEXT_PADDING,
      edgeTile: {
        initial: args.initial,
        style: {
          backgroundColor: avatarFallbackHueVar(args.hueSeed),
          backgroundImage: "linear-gradient(to left, transparent, var(--color-ai-bubble))",
        },
      },
    };
  }
  const portraitUrl = blobPortraitUrl(args.avatarHash, ECHO_PORTRAIT_REQUEST_WIDTH);
  return {
    style: {
      ...ECHO_TEXT_PADDING,
      backgroundImage: `linear-gradient(to left, transparent, var(--color-ai-bubble) var(--immersive-echo-feather)), url("${portraitUrl}")`,
      backgroundSize: "100% 100%, cover",
      backgroundPosition: "0 0, right center",
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
  if (args.kind !== "character") {
    return { style: WHISPER_STRIPE };
  }
  if (args.avatarHash === null) {
    return {
      style: WHISPER_STRIPE,
      headerBand: {
        initial: args.initial,
        style: {
          aspectRatio: "var(--aspect-banner)",
          backgroundColor: avatarFallbackHueVar(args.hueSeed),
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
export const MESSAGE_ROW_SKINS: Record<ChatStyle, RowSkin> = {
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
    chromeBacking: BG_PHOTO_CHROME_SCRIM,
  },
  document: {
    outer: () => "w-full items-center",
    inner: () => cx("w-full max-w-prose px-block py-row text-prose-body", BG_PHOTO_READING_SCRIM),
    avatarTreatment: iconLeftTreatment,
    bubbleLayout: "single",
    chromeBacking: BG_PHOTO_CHROME_SCRIM,
  },
  echo: {
    outer: bubbleOuter,
    inner: bubbleInner,
    avatarTreatment: iconLeftTreatment,
    bubbleDecoration: echoDecoration,
    bubbleLayout: "single",
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
    chromeBacking: BG_PHOTO_CHROME_SCRIM,
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
