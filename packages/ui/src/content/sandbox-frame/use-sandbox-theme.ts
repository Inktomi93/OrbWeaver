// The sandboxed iframe is a null-origin realm that cannot resolve the app's `var(--token)` cascade
// (same wall ECharts' canvas hits — see charts/use-chart-theme.ts): the card body must be injected with
// CONCRETE token values. This hook resolves the surface/text/font tokens the base body rule needs via
// `getComputedStyle` on the document root and re-resolves on a `data-theme` flip, so a Light/Dark switch
// recolors the card instead of baking a stale literal. Color values ride `themeTokens` (re-clamped by
// `isSafeColor` at the frame boundary); the font value is a family LIST (`isSafeColor` rejects it), so it
// rides its own `fontFamily` slot behind a font-list shape check here.
import { useSyncExternalStore } from "react";
import { TOKENS } from "#tokens";

// DOM access rides `globalThis` with self-contained structural types — the node typecheck lane follows
// the lib barrel here and has no `dom` lib (mirrors charts/use-chart-theme.ts).
interface RootElement {
  readonly getPropertyValue?: unknown;
}
interface ComputedStyle {
  readonly getPropertyValue: (property: string) => string;
}
interface ObserverOptions {
  readonly attributes: boolean;
  readonly attributeFilter: string[];
}
interface ThemeObserver {
  observe: (target: RootElement, options: ObserverOptions) => void;
  disconnect: () => void;
}
interface SandboxThemeGlobals {
  readonly document?: { readonly documentElement?: RootElement };
  readonly getComputedStyle?: (element: RootElement) => ComputedStyle;
  // biome-ignore lint/style/useNamingConvention: platform global name — mirrors real `globalThis`.
  readonly MutationObserver?: new (
    callback: () => void,
  ) => ThemeObserver;
}

// Cast via `unknown`: with the `dom` lib present, ambient globalThis shapes don't structurally overlap
// these minimal locals, so a direct assertion is rejected (TS2352).
const sandboxGlobals = globalThis as unknown as SandboxThemeGlobals;

// A font-family LIST shape check (isSafeColor is color-only): letters/digits/space/comma/hyphen/quotes
// only, and never an injection vector — so a hostile custom-theme `--font-sans` can't break out of the
// body rule. A malformed value is dropped (the body falls back to `sans-serif`, never serif).
const FONT_FAMILY_LIST = /^[\w ,'"-]{1,120}$/u;

/** Re-validates a caller-supplied font-family list at the frame boundary; drops anything unsafe. */
export function clampSandboxFontFamily(raw: string | undefined): string | undefined {
  return raw !== undefined && FONT_FAMILY_LIST.test(raw) ? raw : undefined;
}

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

function resolveVar(cssVar: string, fallback: string): string {
  const root = sandboxGlobals.document?.documentElement;
  if (root === undefined || sandboxGlobals.getComputedStyle === undefined) {
    return fallback;
  }
  const resolved = sandboxGlobals.getComputedStyle(root).getPropertyValue(cssVar).trim();
  return resolved === "" ? fallback : resolved;
}

function resolveTokens(): SandboxThemeTokens {
  const themeTokens: Record<string, string> = {};
  for (const [name, token] of Object.entries(COLOR_TOKENS)) {
    themeTokens[name] = resolveVar(token.cssVar, token.value);
  }
  const font = resolveVar(FONT_TOKEN.cssVar, FONT_TOKEN.value);
  return { themeTokens, fontFamily: FONT_FAMILY_LIST.test(font) ? font : undefined };
}

const FALLBACK_TOKENS: SandboxThemeTokens = {
  themeTokens: { "--sandbox-bg": COLOR_TOKENS["--sandbox-bg"].value, "--sandbox-fg": COLOR_TOKENS["--sandbox-fg"].value },
  fontFamily: FONT_FAMILY_LIST.test(FONT_TOKEN.value) ? FONT_TOKEN.value : undefined,
};

// useSyncExternalStore demands a referentially-stable getSnapshot between notifications.
let cachedTokens: SandboxThemeTokens | null = null;

const NO_UNSUBSCRIBE = (): void => undefined;

function getSnapshot(): SandboxThemeTokens {
  if (sandboxGlobals.document?.documentElement === undefined) {
    return FALLBACK_TOKENS;
  }
  cachedTokens ??= resolveTokens();
  return cachedTokens;
}

function getServerSnapshot(): SandboxThemeTokens {
  return FALLBACK_TOKENS;
}

function subscribe(onChange: () => void): () => void {
  const root = sandboxGlobals.document?.documentElement;
  if (root === undefined || sandboxGlobals.MutationObserver === undefined) {
    return NO_UNSUBSCRIBE;
  }
  const observer = new sandboxGlobals.MutationObserver(() => {
    cachedTokens = null;
    onChange();
  });
  observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  return (): void => observer.disconnect();
}

/** Live, theme-reactive concrete surface/text/font tokens for the sandbox base body rule. */
export function useSandboxTheme(): SandboxThemeTokens {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
