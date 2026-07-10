// The chatStyle variant map — ONE MessageRow surface, EIGHT appearances (UI-Theming §12.1: `bubble |
// flat | document`, extended Phase 4 §B.2 with the 5 immersive modes `echo | whisper | hush | ripple |
// tide`), driven by a single exhaustive `Record<ChatStyle, RowSkin>` dispatch (Spine string-union
// discipline §5.5 — the gold-standard mapped-Record over `tailwind-variants`, which is physically
// unreachable from a feature: it is not in @orb/client's package.json). Adding a 9th chatStyle member to
// the render-side vocabulary (@orb/ui/theme-scope) fails `tsc` HERE until this table says how it paints.
// NOT eight surfaces, NOT eight builds — one row, a data-driven skin (§12.1). The live value is
// user-swappable (task #31 appearance-settings, see hooks/use-chat-style).
//
// `ChatStyle` is DERIVED (not re-spelled) from the ONE home `THEME_SCOPE_CHAT_STYLES` and kept
// file-local (client feature dirs have no `contract/` bucket + `export type` is gate-banned there —
// no-inline-types); consumers key off the exported `MESSAGE_ROW_SKINS` table (`keyof typeof …`), so
// the row only ever accepts a style the table actually paints. Class strings are TOKEN utilities only
// (bg-*-bubble / text-prose-body / rounded-card / px-block — the generated @theme names, never a raw
// value), applied to @orb/ui layout+text primitives at the call site — never a raw intrinsic (the
// compose-only keystone).
//
// PHASE 4 EXTENSION (§B.2 — "EXTEND RowSkin, don't branch JSX"): a chatStyle can no longer be expressed
// as pure class-producers alone — Echo bleeds the character's portrait into the bubble, Ripple pins a
// tall sticky portrait beside it, Tide splits one message into several chained bubbles. `RowSkin` grows
// THREE new fields, all DATA the row reads (never a `switch(chatStyle)` in message-row.tsx):
//   - `avatarTreatment(kind)` — how the row's identity art renders: the normal sibling `<Avatar>` chip
//     ("icon-left" — every mode's default, INCLUDING Echo/Whisper's character rows: Moonlit's own
//     preview screenshots show the small round chip next to the name row alongside the bled/banner
//     bubble art, not instead of it — a scannable identity chip plus atmosphere, not a redundancy), or a
//     sticky tall VN portrait ("sticky-portrait", Ripple — this one DOES fully replace the chip, welded
//     into the bubble itself, `renderRowBubble`'s `weldedAvatar` slot). Keyed on `RowAttribution["kind"]`
//     (§A.8 KIND-READY — the SAME resolved tag
//     the row already stamps as `data-kind`), NOT `role`: a multi-character room's null-id "Narrator" row
//     is still `kind: "character"` and gets the immersive treatment; `role` only ever separates
//     mirroring (§B.1's established axis), never identity.
//   - `bubbleDecoration({kind, avatarUrl})` — optional extra className/style for the bubble box (the
//     Whisper/Hush accent stripe, the Echo/Whisper avatar-art paint). HIDE-USER-PORTRAIT (§B.2's Moonlit
//     `hideEchoUserIllustration`/`hideRippleUserAvatar` parity) is each mode's OWN default here — Echo's
//     and Whisper's decorators return early (no art) when `kind !== "character"`, so the viewer's own
//     bubble never bleeds their persona avatar; Hush's stripe is speaker-color chrome, not portrait art,
//     so it paints for every kind on purpose.
//   - `bubbleLayout` — `"single"` (one bubble, every mode but Tide) or `"trains"` (Tide splits the body
//     into per-paragraph bubbles — message-row.tsx's own render-shape branch, `lib/split-paragraphs`).
//
// Per-mode geometry (feather stops, the stripe thickness, the Ripple portrait width) is TOKENIZED
// (`packages/ui/src/tokens/tokens.json` "immersive" group) — no raw px/%/hex here (§B.6: Moonlit's
// blocker was exactly this). Echo/Whisper's "mask" is a LAYERED background-image gradient, not the
// literal CSS `mask-image` property — `mask-image` fades the WHOLE element (backgrounds AND the message
// text painted on top of them), which would dim the reader's own words; a background-image gradient
// layer only ever paints behind text, so the feather is purely decorative.
//
// THE READABILITY REDO (reading-surface rule: art is a corner/edge accent that fades to a CLEAN surface
// BEFORE the text — text NEVER sits on bright art): the Phase-4 build violated this twice, both fixed by
// leaning on OUR sharp variant pipeline instead of shoehorning CSS —
//   - Whisper stretched an arbitrary-aspect avatar into its banner via `background-size: 100% <height>`
//     (a non-uniform squish). The fix requests a genuinely wide, face-safe SHARP crop
//     (`blobBannerUrl`, the 3:1 `banner` variant, `domain/assets/substrate/variant-policy` `BANNER_WIDTHS`)
//     AND renders it as a REAL block-level child (`headerBand`, `message-row-parts.tsx`
//     `renderSingleBubble`) instead of a background layer on the bubble's own message-length-dependent
//     box — a real sub-element gives `background-size:cover` a stable box to crop against (no stretch),
//     and because the band is a normal-flow element ABOVE the padded text, the two can never overlap.
// THE NO-AVATAR FALLBACK IS A FIRST-CLASS AVATAR (owner ruling 2026-07-09,
// `FINAL-Persona-and-Immersive-Chat-Visuals.md`): the deterministic-hue + first-initial tile the
// `@orb/ui/avatar` primitive already paints for an imageless entity is NOT a degraded state — it is a
// legitimate art source. So the art modes no longer collapse for a character with no `avatarHash`: Echo
// and Whisper paint that same hue field (`@orb/ui/avatar` `avatarFallbackHueVar`, seeded off the entity
// id via `RowAttribution.hueSeed` — the SAME seed the list-row chip and chat header use, so one entity =
// one color everywhere) at the SAME geometry + feather as the image would, with the initial in the
// visible zone (Echo → `edgeTile`, Whisper → `headerBand.initial`). Ripple already degraded cleanly —
// its welded slot IS an `<Avatar>`, whose own fallback renders the hue tile at the portrait geometry (the
// only fix there was seeding the hue). Hush/Tide/bubble/flat/document carry no art, only the icon-left
// chip (also now hue-seeded). Reading geometry is byte-identical to the with-image case: only the art
// SOURCE differs (flat hue + initial vs the sharp crop), never the padding/feather stops.
//   - Echo bled the plain (arbitrary-aspect, uncropped) avatar behind the FULL bubble height with only a
//     width-wise fade — a long message's text ran directly under still-bright pixels. The fix requests
//     the sharp-cropped 2:3 `blobPortraitUrl` variant (a real face-safe portrait, not the raw original)
//     AND pads the bubble's text `padding-right: var(--immersive-echo-feather)` — an INLINE style, so it
//     always wins the cascade over `px-block` (message-row-parts.tsx's own documented `cn`-doesn't-know-
//     custom-classGroups footgun) — using the SAME token that drives the gradient stop, so "where the art
//     is fully faded" and "where the text is allowed to start" are ONE number, not two that could drift.

import { blobBannerUrl, blobPortraitUrl } from "@orb/contracts/assets";
import type { MessageRole } from "@orb/kit/message-role";
import { avatarFallbackHueVar } from "@orb/ui/avatar";
import type { THEME_SCOPE_CHAT_STYLES } from "@orb/ui/theme-scope";
import type { CSSProperties } from "react";
import { cn } from "#lib";
import type { RowAttribution } from "./attribution";
import { BG_PHOTO_CHROME_SCRIM, BG_PHOTO_READING_SCRIM } from "./message-row-backing";

type ChatStyle = (typeof THEME_SCOPE_CHAT_STYLES)[number];

/** The per-role bubble token family (kit MESSAGE_ROLES → the three D44 bubble token sets, §12.1). */
const BUBBLE_TOKENS: Record<MessageRole, string> = {
  user: "bg-user-bubble text-user-bubble-foreground",
  assistant: "bg-ai-bubble text-ai-bubble-foreground",
  system: "bg-system-bubble text-system-bubble-foreground",
};

/** Where a row's content sits on the cross axis (a Stack `align` utility — user right, else left). */
function alignFor(role: MessageRole): string {
  return role === "user" ? "items-end" : "items-start";
}

// `cn` is typed `string | undefined` (never undefined at runtime); coalesce so each skin returns `string`.
const cx = (...args: Parameters<typeof cn>): string => cn(...args) ?? "";

// ── §B.2 avatar treatment — how a row's identity art renders ───────────────────────────────────────────

// File-local (not `export type` — no-inline-types §7.4, same rule `ChatStyle` above follows): consumers
// key off `RowSkin["avatarTreatment"]`/`RowSkin["bubbleLayout"]` (`ReturnType<...>`/indexed access),
// never a re-spelled union.

/** How a row renders its identity art. `icon-left` is the sibling `<Avatar>` chip — every mode's
 *  default, INCLUDING Echo/Whisper's character rows (Moonlit's own preview screenshots show the small
 *  chip next to the name row ALONGSIDE the bled/banner bubble art, not instead of it — `bubbleDecoration`
 *  below is independently kind-gated, so it still paints regardless of this axis). `sticky-portrait` is
 *  Ripple's VN pinned tall portrait, welded into the bubble (`renderRowBubble`'s `weldedAvatar` slot) —
 *  the one treatment that DOES replace the sibling chip. This axis has no home outside this file (net-new
 *  §B.2 vocabulary) — the tuple below IS its home (gate no-inline-union-redecl §7.5: declare once as
 *  `as const`, derive the type, never re-spell the literal union).
 */
const AVATAR_TREATMENTS = ["icon-left", "sticky-portrait"] as const;
type AvatarTreatment = (typeof AVATAR_TREATMENTS)[number];

/** The bubble render shape: one bubble (`single`, every mode but Tide) or Tide's per-paragraph "train"
 *  of chained bubbles (`trains` — message-row.tsx splits `message.content` via `lib/split-paragraphs`). */
type BubbleLayout = "single" | "trains";

/** Input to a mode's `bubbleDecoration` — the row's resolved KIND (§A.8; NOT role — see file header) and
 *  the resolved identity avatar CAS hash (`null` when there's no image, e.g. the initials-fallback case).
 *  The HASH, not a prebuilt URL: each decorator requests its OWN correctly-shaped sharp variant (Echo →
 *  `blobPortraitUrl`, Whisper → `blobBannerUrl`) — the row that calls `bubbleDecoration` has no opinion on
 *  which crop a given mode needs. */
export interface BubbleDecorationArgs {
  readonly kind: RowAttribution["kind"];
  readonly avatarHash: string | null;
  /** The stable per-entity seed (`RowAttribution["hueSeed"]`) for the deterministic fallback hue
   *  (`@orb/ui/avatar` `avatarFallbackHueVar`) — used ONLY on the no-image path, where the mode's art
   *  becomes a generated hue tile. */
  readonly hueSeed: string;
  /** The already-resolved grapheme-safe initials (`initialsForAttribution` → `@orb/kit/initials`, whose
   *  `Intl.Segmenter` yields whole grapheme clusters — a leading emoji/astral char stays intact, never a
   *  split surrogate; resolved once in message-row.tsx) — the glyph the fallback tile shows. Empty only
   *  for a name-less row, which never reaches a decorator (kind-gated). */
  readonly initial: string;
}

/** Extra className/style for the bubble box — merged onto the existing `skin.inner(role)` classes. */
export interface BubbleDecoration {
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Whisper's header-art BAND — a real block-level child rendered ABOVE the bubble's padded text
   *  (`message-row-parts.tsx` `renderSingleBubble`), not a background layer on the bubble's own box (see
   *  the file header's readability redo). Absent for every mode but Whisper. `initial` is set ONLY on the
   *  no-avatar FALLBACK band (the owner-ruled first-class tile) — the band paints the entity's hue field
   *  + this glyph instead of the banner image; absent ⇒ the band is a pure image (aria-hidden either way). */
  readonly headerBand?:
    | { readonly style: CSSProperties; readonly initial?: string | undefined }
    | undefined;
  /** Echo's no-avatar FALLBACK edge TILE (owner ruling 2026-07-09 — the fallback tile is a first-class
   *  avatar, so it IS Echo's art source when the character has no image): a real block-level child pinned
   *  to the bubble's bled edge (`message-row-parts.tsx` `renderSingleBubble`), painting the entity's
   *  deterministic hue field feathered into the bubble bg EXACTLY like the portrait would, with the
   *  initial in the fully-visible (un-feathered) zone. Absent for the WITH-image Echo path (that stays the
   *  tuned background-image bleed, unchanged) and every other mode. The bubble still reserves the SAME
   *  `padding-right: var(--immersive-echo-feather)` (in `style`) so the reading geometry is identical to
   *  the with-art case. */
  readonly edgeTile?: { readonly style: CSSProperties; readonly initial: string } | undefined;
}

/** One row's skin: the outer alignment/width classes + the inner content-container classes (both
 *  role-keyed, UNCHANGED shape from pre-Phase-4), plus the three Phase-4 additions above. */
export interface RowSkin {
  /** Classes for the outer Stack (cross-axis alignment / full width). */
  readonly outer: (role: MessageRole) => string;
  /** Classes for the inner content Stack (bubble bg/padding/radius, or the flat/document treatment). */
  readonly inner: (role: MessageRole) => string;
  /** §B.2 — how this row's identity art renders, resolved from `RowAttribution["kind"]`. */
  readonly avatarTreatment: (kind: RowAttribution["kind"]) => AvatarTreatment;
  /** §B.2 — optional extra bubble decoration (the accent stripe / bled-or-banner art paint). Absent for
   *  bubble/flat/document/ripple/tide (their bubble carries no extra decoration). */
  readonly bubbleDecoration?: (args: BubbleDecorationArgs) => BubbleDecoration | null;
  /** §B.2 — Tide's per-paragraph "train" render shape; `"single"` for every other mode. */
  readonly bubbleLayout: BubbleLayout;
  /** Side-eye P1 (2026-07-09) — the reading-scrim backing for the NAME + action-icon CHROME row (a
   *  sibling ABOVE the bubble, message-row.tsx), applied to `data-slot="message-name-row"`. Present ONLY
   *  for the no-fill modes (flat/hush/document), whose chrome otherwise floats on the raw photo; a filled
   *  mode leaves it undefined (its bubble anchors the chrome — see `BG_PHOTO_CHROME_SCRIM`). Self-gated by
   *  `in-data-[has-bg-image]:`, so it's inert without a bg image. */
  readonly chromeBacking?: string | undefined;
}

// ── Shared base shapes (bubble-family / flat-family) — reused by the immersive modes that build on them ─

function bubbleOuter(role: MessageRole): string {
  // UIP-304: the whole row is a centered reading column capped at the shell's `--width-shell-content`
  // var (`mx-auto max-w-(--width-shell-content)` — the settings §11.1 clamp(680px, chatWidthPct dvw,
  // 100dvw), stamped at the app-shell root and inherited down; the CSS-var Tailwind shorthand, not a
  // raw bracketed literal, so `no-arbitrary-tw-values` doesn't fire), with the per-role bubble aligned
  // user-right / assistant-left WITHIN it — so a bubble never spans a 1920px viewport, and the
  // composer's own matching column aligns with it.
  return cx("mx-auto w-full max-w-(--width-shell-content)", alignFor(role));
}
function bubbleInner(role: MessageRole): string {
  return cx("max-w-prose rounded-card px-block py-row", BUBBLE_TOKENS[role]);
}
// `flat` is full-width by design (UIP-304) — but padded on the SECTION scale, not the tighter block
// scale, so a full-bleed row still breathes.
function flatOuter(): string {
  return "w-full items-stretch";
}
function flatInner(role: MessageRole): string {
  return cx(
    "w-full px-section py-row",
    BG_PHOTO_READING_SCRIM,
    role === "system" && "text-muted-foreground",
  );
}
const iconLeftTreatment = (): AvatarTreatment => "icon-left";

// ── §B.2 avatar-treatment resolvers — the hide-user-portrait default lives HERE (kind-gated) ────────────
// Echo/Whisper have no resolver of their own anymore — they keep the plain `iconLeftTreatment` chip
// (see the `AvatarTreatment` doc comment above) and get their bled/banner ART entirely from
// `bubbleDecoration` below, which is independently kind-gated.

function rippleAvatarTreatment(kind: RowAttribution["kind"]): AvatarTreatment {
  return kind === "character" ? "sticky-portrait" : "icon-left";
}

// ── §B.2 bubble decorations ────────────────────────────────────────────────────────────────────────────

/** Hush's speaker-color LEFT stripe — chrome, not portrait art, so it paints for every kind (the
 *  hide-user-portrait default is about ART leaking onto the viewer's own row, not a color chip). */
const STRIPE_LEFT: CSSProperties = {
  borderLeftWidth: "var(--immersive-stripe-width)",
  borderLeftStyle: "solid",
  borderLeftColor: "var(--color-speaker)",
};
function hushDecoration(): BubbleDecoration {
  return { style: STRIPE_LEFT };
}

// Echo requests the WIDE rung of the sharp-cropped 2:3 portrait ladder (`PORTRAIT_WIDTHS`,
// `domain/assets/substrate/variant-policy.ts`) — a full-height edge accent reads bigger than Ripple's
// message-row chip, so it earns the crisper rung.
const ECHO_PORTRAIT_REQUEST_WIDTH = 400;

/** The reading-geometry contract shared by BOTH Echo paths (with-image bleed AND the no-image fallback
 *  tile): the bubble reserves `padding-right = var(--immersive-echo-feather)` so text can only ever start
 *  where the art is fully dissolved into the bubble color — the ONE number that must be identical between
 *  the two so the fallback aligns pixel-for-pixel with the tuned with-art case. */
const ECHO_TEXT_PADDING: CSSProperties = { paddingRight: "var(--immersive-echo-feather)" };

/** Echo's bled edge art: a layered `background-image` (a scrim gradient painted OVER the character's
 *  sharp-cropped 2:3 portrait — `blobPortraitUrl`, a real face-safe crop, never the raw arbitrary-aspect
 *  original — both BEHIND the bubble's own `bg-ai-bubble`, visible only where both layers are
 *  transparent) — never a literal `mask-image` (see file header: that would also fade the message text
 *  sitting on top of the same box). `padding-right` (an INLINE style, so it always wins the cascade over
 *  the bubble's `px-block`) reserves the SAME width as the feather stop — the reading-surface guarantee:
 *  text can only ever start where the art is already fully dissolved into the bubble color, never before.
 *
 *  `null` ONLY for a non-character row (hide-user-portrait). A character with NO resolved avatar no longer
 *  degrades to a plain bubble (the pre-2026-07-09 behavior — the mode "didn't work" for imageless
 *  characters): per the owner ruling the fallback tile IS a first-class avatar, so it becomes Echo's art
 *  source — an `edgeTile` painting the entity's deterministic hue field, feathered into the bubble bg with
 *  the SAME `--immersive-echo-feather` stop and reserving the SAME padding, so the reading geometry is
 *  byte-identical to the with-image case; only the art SOURCE differs (flat hue + initial vs portrait). */
function echoDecoration(args: BubbleDecorationArgs): BubbleDecoration | null {
  if (args.kind !== "character") {
    return null;
  }
  if (args.avatarHash === null) {
    return {
      style: ECHO_TEXT_PADDING,
      edgeTile: {
        initial: args.initial,
        // A flat hue field (the entity's `avatarFallbackHueVar`) with the SAME right→left feather the
        // portrait uses — the gradient spans the tile's OWN width (which is `--immersive-echo-feather`
        // wide, message-row-parts.tsx), so it reaches full bubble color at the tile's left edge = the
        // exact stop the with-image gradient reaches, matching the fade profile. The initial rides
        // `--color-primary-foreground` (message-row-parts.tsx className, AA-verified against all 5 hues).
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

// Whisper requests the crisp rung of the sharp-cropped 3:1 banner ladder (`BANNER_WIDTHS`,
// `domain/assets/substrate/variant-policy.ts`) — a full-width hero band earns the top rung.
const WHISPER_BANNER_REQUEST_WIDTH = 800;

/** Whisper's speaker-color TOP stripe — chrome, always paints (see `hushDecoration` for why hide-user-
 *  portrait doesn't apply to chrome). */
const WHISPER_STRIPE: CSSProperties = {
  borderTopWidth: "var(--immersive-stripe-width)",
  borderTopStyle: "solid",
  borderTopColor: "var(--color-speaker)",
};

/** Whisper's header-art band + speaker-color TOP stripe. The stripe always paints; the band only for a
 *  character row with a resolved avatar (hide-user-portrait) — requests the sharp-cropped 3:1 `banner`
 *  variant (`blobBannerUrl`, a real face-safe wide crop, never the raw original stretched via
 *  `background-size`, the Phase-4 squish bug) and returns it as `headerBand` — a REAL block-level child
 *  `message-row-parts.tsx` renders ABOVE the padded text (never a background layer on the bubble's own
 *  message-length-dependent box), so `background-size:cover` has a stable box to crop against (no
 *  stretch) and the text — normal document flow, below the band — can never sit on the art. The band
 *  is a `--aspect-banner` (3:1) box — height DERIVES from the bubble's width so the displayed box
 *  always matches the server's 3:1 crop (a fixed height drifted the box aspect off 3:1 as the fluid
 *  bubble width changed, re-cropping the face-safe source). Still a definite box (aspect-ratio gives
 *  it height), so the anti-squish property holds regardless of message length. */
function whisperDecoration(args: BubbleDecorationArgs): BubbleDecoration {
  // The speaker-color stripe is chrome — always paints. Only the BAND is kind-gated (hide-user-portrait):
  // a non-character row gets the stripe alone (no band). A character row ALWAYS gets a band now — the
  // banner image when it has one, else the owner-ruled fallback tile (a hue field + initial at the SAME
  // 3:1 geometry + feather), so the mode no longer collapses to a bare stripe for imageless characters.
  if (args.kind !== "character") {
    return { style: WHISPER_STRIPE };
  }
  if (args.avatarHash === null) {
    return {
      style: WHISPER_STRIPE,
      headerBand: {
        initial: args.initial,
        // The SAME 3:1 box + top→bottom feather the banner uses, over the entity's flat hue field (its
        // `avatarFallbackHueVar`) instead of the image — the initial rides `--color-primary-foreground`
        // in the band's visible (top) zone (message-row-parts.tsx).
        style: {
          aspectRatio: "var(--aspect-banner)",
          backgroundColor: avatarFallbackHueVar(args.hueSeed),
          backgroundImage:
            "linear-gradient(to bottom, transparent, var(--color-ai-bubble) var(--immersive-whisper-feather))",
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

/**
 * The exhaustive chatStyle → skin table. `bubble` = rounded per-role tinted bubbles (the ST-parity
 * default); `flat` = full-width rows, no bubble chrome, system muted; `document` = centered manuscript
 * column on prose-body color (the design-corpus reading mode). §B.2 immersive: `echo` bleeds the
 * character's portrait into the bubble edge; `whisper` banners it across the top + a speaker stripe;
 * `hush` is flat + a speaker stripe only (the lightest-touch mode); `ripple` pins a tall VN portrait
 * beside the bubble; `tide` chains the body into per-paragraph bubbles. The `Record<ChatStyle, …>` type
 * is the enforcement: a new chatStyle can't ship without a row here.
 */
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
  // `document` = the centered manuscript column (prose-capped ~65ch), already centered by `items-center`.
  // Over a bg photo it too carries no fill → the same reading-scrim backing (side-eye P1).
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
