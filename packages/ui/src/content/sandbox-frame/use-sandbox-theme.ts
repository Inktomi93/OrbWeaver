// The sandboxed iframe is a null-origin realm that cannot resolve the app's `var(--token)` cascade
// (same wall ECharts' canvas hits — see charts/use-chart-theme.ts, and the shared live-token-resolver
// seam both ride, `#lib`'s `createLiveTokenStore`/`resolveCssVar`): the card body must be injected with
// CONCRETE token values. This hook resolves the surface/text/font tokens the base body rule needs via
// `getComputedStyle` on the document root and re-resolves on a `data-theme` flip, so a Light/Dark switch
// recolors the card instead of baking a stale literal. Color values ride `themeTokens` (re-clamped by
// `isSafeColor` at the frame boundary); the font value is a family LIST (`isSafeColor` rejects it), so it
// rides its own `fontFamily` slot behind the kit font-list shape check.
import { clampCardFrameFontFamily } from "@orb/kit/card-frame";
import { useSyncExternalStore } from "react";
import { createLiveTokenStore, resolveCssVar } from "#lib";
import { TOKENS } from "#tokens";

const THEME_ATTRIBUTE_FILTER = ["data-theme"];

const COLOR_TOKENS = {
  "--sandbox-bg": TOKENS["color.card"],
  "--sandbox-fg": TOKENS["color.card-foreground"],
} as const;

const FONT_TOKEN = TOKENS["font.sans"];

/** The concrete, theme-resolved tokens the sandbox base body rule needs. */
export interface SandboxThemeTokens {
  /** Safe `--*` color vars, injected + re-clamped by `isSafeColor` at the frame boundary. */
  readonly themeTokens: Readonly<Record<string, string>>;
  /** The resolved UI font-family list, or `undefined` when unresolved/unsafe. */
  readonly fontFamily: string | undefined;
}

function resolveTokens(): SandboxThemeTokens {
  const themeTokens: Record<string, string> = {};
  for (const [name, token] of Object.entries(COLOR_TOKENS)) {
    themeTokens[name] = resolveCssVar(token.cssVar, token.value);
  }
  return { themeTokens, fontFamily: clampCardFrameFontFamily(resolveCssVar(FONT_TOKEN.cssVar, FONT_TOKEN.value)) };
}

const FALLBACK_TOKENS: SandboxThemeTokens = {
  themeTokens: { "--sandbox-bg": COLOR_TOKENS["--sandbox-bg"].value, "--sandbox-fg": COLOR_TOKENS["--sandbox-fg"].value },
  fontFamily: clampCardFrameFontFamily(FONT_TOKEN.value),
};

const sandboxThemeStore = createLiveTokenStore(resolveTokens, FALLBACK_TOKENS, THEME_ATTRIBUTE_FILTER);

/** Live, theme-reactive concrete surface/text/font tokens for the sandbox base body rule. */
export function useSandboxTheme(): SandboxThemeTokens {
  return useSyncExternalStore(sandboxThemeStore.subscribe, sandboxThemeStore.getSnapshot, sandboxThemeStore.getServerSnapshot);
}
