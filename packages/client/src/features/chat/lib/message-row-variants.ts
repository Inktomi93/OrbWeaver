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
//     ("icon-left", the pre-Phase-4 behavior every mode but Ripple's non-character rows keeps), a sticky
//     tall VN portrait ("sticky-portrait", Ripple), or art painted AS bubble decoration instead of a
//     sibling chip ("bled" Echo / "banner" Whisper — `renderRowAvatar` returns null for these so the art
//     isn't rendered twice). Keyed on `RowAttribution["kind"]` (§A.8 KIND-READY — the SAME resolved tag
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

import type { MessageRole } from "@orb/kit/message-role";
import type { THEME_SCOPE_CHAT_STYLES } from "@orb/ui/theme-scope";
import type { CSSProperties } from "react";
import { cn } from "#lib";
import type { RowAttribution } from "./attribution";

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

/** How a row renders its identity art. `icon-left` is the pre-Phase-4 sibling `<Avatar>` chip (every
 *  mode's non-character rows, plus bubble/flat/document/hush/tide unconditionally). `sticky-portrait` is
 *  Ripple's VN pinned tall portrait. `bled`/`banner` mean the art paints AS bubble decoration instead —
 *  `renderRowAvatar` (message-row.tsx) returns no sibling chip for these two. This axis has no home
 *  outside this file (net-new §B.2 vocabulary) — the tuple below IS its home (gate no-inline-union-redecl
 *  §7.5: declare once as `as const`, derive the type, never re-spell the literal union).
 */
const AVATAR_TREATMENTS = ["icon-left", "bled", "banner", "sticky-portrait"] as const;
type AvatarTreatment = (typeof AVATAR_TREATMENTS)[number];

/** The bubble render shape: one bubble (`single`, every mode but Tide) or Tide's per-paragraph "train"
 *  of chained bubbles (`trains` — message-row.tsx splits `message.content` via `lib/split-paragraphs`). */
type BubbleLayout = "single" | "trains";

/** Input to a mode's `bubbleDecoration` — the row's resolved KIND (§A.8; NOT role — see file header) and
 *  the resolved identity avatar URL (`null` when there's no image, e.g. the initials-fallback case). */
export interface BubbleDecorationArgs {
  readonly kind: RowAttribution["kind"];
  readonly avatarUrl: string | null;
}

/** Extra className/style for the bubble box — merged onto the existing `skin.inner(role)` classes. */
export interface BubbleDecoration {
  readonly className?: string;
  readonly style?: CSSProperties;
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
  return cx("w-full px-section py-row", role === "system" && "text-muted-foreground");
}
const iconLeftTreatment = (): AvatarTreatment => "icon-left";

// ── §B.2 avatar-treatment resolvers — the hide-user-portrait default lives HERE (kind-gated) ────────────

function echoAvatarTreatment(kind: RowAttribution["kind"]): AvatarTreatment {
  return kind === "character" ? "bled" : "icon-left";
}
function whisperAvatarTreatment(kind: RowAttribution["kind"]): AvatarTreatment {
  return kind === "character" ? "banner" : "icon-left";
}
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

/** Echo's bled edge art: a layered `background-image` (a scrim gradient painted OVER the character's
 *  portrait, both BEHIND the bubble's own `bg-ai-bubble` — visible only where both layers are
 *  transparent) — never a literal `mask-image` (see file header: that would also fade the message text
 *  sitting on top of the same box). `null` for a non-character row (hide-user-portrait) or a
 *  character with no resolved avatar (nothing to bleed). */
function echoDecoration(args: BubbleDecorationArgs): BubbleDecoration | null {
  if (args.kind !== "character" || args.avatarUrl === null) {
    return null;
  }
  return {
    style: {
      backgroundImage: `linear-gradient(to left, transparent, var(--color-ai-bubble) var(--immersive-echo-feather)), url("${args.avatarUrl}")`,
      backgroundSize: "100% 100%, cover",
      backgroundPosition: "0 0, right center",
      backgroundRepeat: "no-repeat, no-repeat",
    },
  };
}

/** Whisper's top avatar banner + speaker-color TOP stripe. The stripe always paints (speaker-color
 *  chrome); the banner art only for a character row with a resolved avatar (hide-user-portrait). */
function whisperDecoration(args: BubbleDecorationArgs): BubbleDecoration {
  const stripe: CSSProperties = {
    borderTopWidth: "var(--immersive-stripe-width)",
    borderTopStyle: "solid",
    borderTopColor: "var(--color-speaker)",
  };
  if (args.kind !== "character" || args.avatarUrl === null) {
    return { style: stripe };
  }
  return {
    style: {
      ...stripe,
      backgroundImage: `linear-gradient(to bottom, transparent, var(--color-ai-bubble) var(--immersive-whisper-feather)), url("${args.avatarUrl}")`,
      backgroundSize: "100% 100%, cover",
      backgroundPosition: "0 0, top center",
      backgroundRepeat: "no-repeat, no-repeat",
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
  },
  // `document` = the centered manuscript column (prose-capped ~65ch), already centered by `items-center`.
  document: {
    outer: () => "w-full items-center",
    inner: () => "w-full max-w-prose px-block py-row text-prose-body",
    avatarTreatment: iconLeftTreatment,
    bubbleLayout: "single",
  },
  echo: {
    outer: bubbleOuter,
    inner: bubbleInner,
    avatarTreatment: echoAvatarTreatment,
    bubbleDecoration: echoDecoration,
    bubbleLayout: "single",
  },
  whisper: {
    outer: bubbleOuter,
    inner: bubbleInner,
    avatarTreatment: whisperAvatarTreatment,
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
