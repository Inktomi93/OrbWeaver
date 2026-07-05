// The chatStyle variant map — ONE MessageRow surface, three appearances (UI-Theming §12.1: `bubble |
// flat | document`), driven by a single exhaustive `Record<ChatStyle, …>` dispatch (Spine
// string-union discipline §5.5 — the gold-standard mapped-Record over `tailwind-variants`, which is
// physically unreachable from a feature: it is not in @orb/client's package.json). Adding a fourth
// chatStyle member to the render-side vocabulary (@orb/ui/theme-scope) fails `tsc` HERE until this
// table says how it paints. NOT three surfaces, NOT three builds — one row, a data-driven skin
// (§12.1). The live value is user-swappable (task #31 appearance-settings, see hooks/use-chat-style).
//
// `ChatStyle` is DERIVED (not re-spelled) from the ONE home `THEME_SCOPE_CHAT_STYLES` and kept
// file-local (client feature dirs have no `contract/` bucket + `export type` is gate-banned there —
// no-inline-types); consumers key off the exported `MESSAGE_ROW_SKINS` table (`keyof typeof …`), so
// the row only ever accepts a style the table actually paints. Class strings are TOKEN utilities only
// (bg-*-bubble / text-prose-body / rounded-card / px-block — the generated @theme names, never a raw
// value), applied to @orb/ui layout+text primitives at the call site — never a raw intrinsic (the
// compose-only keystone).

import type { MessageRole } from "@orb/kit/message-role";
import type { THEME_SCOPE_CHAT_STYLES } from "@orb/ui/theme-scope";
import { cn } from "#lib";

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

/** One row's skin: the outer alignment/width classes + the inner content-container classes. Both are
 *  functions of the row's role so a single style handles user/assistant/system without branching at
 *  the call site. */
export interface RowSkin {
  /** Classes for the outer Stack (cross-axis alignment / full width). */
  readonly outer: (role: MessageRole) => string;
  /** Classes for the inner content Stack (bubble bg/padding/radius, or the flat/document treatment). */
  readonly inner: (role: MessageRole) => string;
}

/**
 * The exhaustive chatStyle → skin table. `bubble` = rounded per-role tinted bubbles (the ST-parity
 * default); `flat` = full-width rows, no bubble chrome, system muted; `document` = centered
 * manuscript column on prose-body color (the design-corpus reading mode). The `Record<ChatStyle, …>`
 * type is the enforcement: a new chatStyle can't ship without a row here.
 */
// `cn` is typed `string | undefined` (never undefined at runtime); coalesce so each skin returns `string`.
const cx = (...args: Parameters<typeof cn>): string => cn(...args) ?? "";

export const MESSAGE_ROW_SKINS: Record<ChatStyle, RowSkin> = {
  // UIP-304: the whole row is a centered ≤48rem (`--container-cq-lg`) reading column (`mx-auto
  // max-w-cq-lg`), with the per-role bubble aligned user-right / assistant-left WITHIN it — so a bubble
  // never spans a 1920px viewport, and the composer's own `max-w-cq-lg` column aligns with it.
  bubble: {
    outer: (role) => cx("mx-auto w-full max-w-cq-lg", alignFor(role)),
    inner: (role) => cx("max-w-prose rounded-card px-block py-row", BUBBLE_TOKENS[role]),
  },
  // `flat` is full-width by design (UIP-304) — but padded on the SECTION scale, not the tighter block
  // scale, so a full-bleed row still breathes.
  flat: {
    outer: () => "w-full items-stretch",
    inner: (role) => cx("w-full px-section py-row", role === "system" && "text-muted-foreground"),
  },
  // `document` = the centered manuscript column (prose-capped ~65ch), already centered by `items-center`.
  document: {
    outer: () => "w-full items-center",
    inner: () => "w-full max-w-prose px-block py-row text-prose-body",
  },
};
