// The sandboxed iframe is a null-origin realm that cannot resolve the app's `var(--token)` cascade
// (same wall ECharts' canvas hits — see charts/use-chart-theme.ts, and the shared live-token-resolver
// seam both ride, `#lib`'s `createLiveTokenStore`/`resolveCssVar`): the card body must be injected with
// CONCRETE token values. This hook resolves the surface/text/font tokens the base body rule needs via
// `getComputedStyle` on the app's marked resolution root (`LIVE_TOKEN_ROOT_ATTRIBUTE` — the shell grid the
// card frame paints inside, not `documentElement`, #504) and re-resolves on every channel that moves a
// token (the seam's list + coverage audit — this hook does not carry its own filter, #503: what moves a
// token is a property of the cascade, not of the consumer), so a Light/Dark switch OR a custom-theme flip
// recolors the card instead of baking a stale literal. Color values ride `themeTokens`
// (re-clamped by `isSafeColor` at the frame boundary); the font value is a family LIST (`isSafeColor`
// rejects it), so it rides its own `fontFamily` slot behind the kit font-list shape check.
import type { CardFrameStyleTokens } from "@orb/kit/card-frame";
import { CARD_FRAME_STYLE_TOKEN, clampCardFrameFontFamily, clampCardFrameStyleTokens } from "@orb/kit/card-frame";
import { useSyncExternalStore } from "react";
import { createLiveTokenStore, resolveCssLength, resolveCssVar } from "#lib";
import { LENGTH_BASE_PX, TOKENS } from "#tokens";

// THE CURATED HOUSE SLICE (#799). It was TWO colors — a frame could match the app's surface and its text and
// nothing else, which is why `pocket-arcade` was the ceiling of "looks house" for the tier (stickler
// 2026-08-29 §1). Each name below is a var a self-contained interface actually needs to sit inside the app
// without guessing: a recessive surface + its text, the one accent + its foreground, and a rule/edge color.
// Every value rides the SAME `isSafeColor` clamp at the frame boundary the original two do — widening the
// SLICE is not widening the CLAMP, and no non-color value can enter this record (the clamp drops it).
const COLOR_TOKENS = {
  "--sandbox-bg": TOKENS["color.card"],
  "--sandbox-fg": TOKENS["color.card-foreground"],
  "--sandbox-muted": TOKENS["color.muted"],
  "--sandbox-muted-fg": TOKENS["color.muted-foreground"],
  "--sandbox-accent": TOKENS["color.primary"],
  "--sandbox-accent-fg": TOKENS["color.primary-foreground"],
  "--sandbox-border": TOKENS["color.border"],
} as const;

const FONT_TOKEN = TOKENS["font.sans"];
/** The NON-COLOR half of the slice (#799) — `isSafeColor` is color-only and rejects both of these by
 *  construction, so they ride the kit's style-token clamp (a CSS length or a font-family list) in their own
 *  record. That split is the `fontFamily` slot's own precedent, one shape class over. */
const STYLE_TOKENS = {
  [CARD_FRAME_STYLE_TOKEN.radius]: TOKENS["radius.base"],
  [CARD_FRAME_STYLE_TOKEN.monoFamily]: TOKENS["font.mono"],
} as const;

/** The appearance channel that scales the host root. */
const FONT_SCALE_CSS_VAR = "--appearance-font-scale";
const ROOT_SIZE_VAR = CARD_FRAME_STYLE_TOKEN.rootSize;
/** A card's content inset: the block step, the one an inert card's body and every card header take. */
const CARD_INSET_TOKEN = "spacing.block";
const PERCENT = 100;

/** The frame root's font-size as a percent of the frame's own default, so the clamp's length grammar admits it. */
function rootSizePercent(scale: number): string {
  return `${Math.round(scale * PERCENT * PERCENT) / PERCENT}%`;
}

/** The concrete, theme-resolved tokens the sandbox base body rule needs. */
export interface SandboxThemeTokens {
  /** Safe `--*` color vars, injected + re-clamped by `isSafeColor` at the frame boundary. */
  readonly themeTokens: Readonly<Record<string, string>>;
  /** The NON-COLOR slice (radius, the mono family, the root size), re-clamped by the kit style-token grammar. */
  readonly styleTokens: CardFrameStyleTokens;
  /** `styleTokens` plus the card body's inset, for a card's frame. A styled reply's frame takes `styleTokens`, so its
   *  body sits flush with the message. */
  readonly cardStyleTokens: CardFrameStyleTokens;
  /** The resolved UI font-family list, or `undefined` when unresolved/unsafe. */
  readonly fontFamily: string | undefined;
}

function resolveTokens(): SandboxThemeTokens {
  const themeTokens: Record<string, string> = {};
  for (const [name, token] of Object.entries(COLOR_TOKENS)) {
    themeTokens[name] = resolveCssVar(token.cssVar, token.value);
  }
  const styleTokens: Record<string, string> = {};
  for (const [name, token] of Object.entries(STYLE_TOKENS)) {
    styleTokens[name] = resolveCssVar(token.cssVar, token.value);
  }
  // The user's text scale rides the same length clamp as a root percentage; a frame root cannot inherit the host's `:root` font-size.
  styleTokens[ROOT_SIZE_VAR] = rootSizePercent(Number.parseFloat(resolveCssVar(FONT_SCALE_CSS_VAR, "1")));
  // Clamped HERE as well as at the frame boundary: the resolved value comes off a live cascade a custom theme
  // can write, so a hostile `--radius-base` must not travel as a mint payload at all.
  // Resolved through the browser to px: the token's value is a `round()` expression the frame's length grammar refuses,
  // and the frame cannot resolve the host's rem.
  const inset = `${resolveCssLength(TOKENS[CARD_INSET_TOKEN].cssVar, LENGTH_BASE_PX[CARD_INSET_TOKEN])}px`;
  return {
    themeTokens,
    styleTokens: clampCardFrameStyleTokens(styleTokens),
    cardStyleTokens: clampCardFrameStyleTokens({ ...styleTokens, [CARD_FRAME_STYLE_TOKEN.inset]: inset }),
    fontFamily: clampCardFrameFontFamily(resolveCssVar(FONT_TOKEN.cssVar, FONT_TOKEN.value)),
  };
}

const FALLBACK_STYLE_TOKENS = {
  ...Object.fromEntries(Object.entries(STYLE_TOKENS).map(([name, token]) => [name, token.value])),
  [ROOT_SIZE_VAR]: rootSizePercent(1),
};

const FALLBACK_TOKENS: SandboxThemeTokens = {
  themeTokens: Object.fromEntries(Object.entries(COLOR_TOKENS).map(([name, token]) => [name, token.value])),
  styleTokens: clampCardFrameStyleTokens(FALLBACK_STYLE_TOKENS),
  cardStyleTokens: clampCardFrameStyleTokens({ ...FALLBACK_STYLE_TOKENS, [CARD_FRAME_STYLE_TOKEN.inset]: `${LENGTH_BASE_PX[CARD_INSET_TOKEN]}px` }),
  fontFamily: clampCardFrameFontFamily(FONT_TOKEN.value),
};

const sandboxThemeStore = createLiveTokenStore(resolveTokens, FALLBACK_TOKENS);

/** Live, theme-reactive concrete surface/text/font tokens for the sandbox base body rule. */
export function useSandboxTheme(): SandboxThemeTokens {
  return useSyncExternalStore(sandboxThemeStore.subscribe, sandboxThemeStore.getSnapshot, sandboxThemeStore.getServerSnapshot);
}
