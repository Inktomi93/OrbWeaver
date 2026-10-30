// The live-token-resolver seam (§14, 2026-08-09 report card): canvas/iframe realms can't resolve
// `var(--token)` — chart chrome (ECharts canvas) and the sandbox card frame (a null-origin srcdoc) both
// need CONCRETE token values, re-resolved via a MutationObserver over the DOM that can move a token
// (`LIVE_TOKEN_ROOT_ATTRIBUTE` + `TOKEN_MOVING_ROOT_ATTRIBUTES` below — their comments are the coverage
// audit), served through `useSyncExternalStore` so a Light/Dark switch repaints instead of baking a stale
// literal. Was three near-identical spellings (charts/use-chart-theme.ts, sandbox-frame/use-sandbox-theme.ts,
// web-weave's probe-element variant); this module is the ONE mechanics home — each consumer keeps its own
// token shape (ChartColors roles, SandboxThemeTokens, WeavePalette) as a thin projection over it.
//
// IT RESOLVES FROM WHERE THE CONSUMER PAINTS, NOT FROM `<html>` (#504). Every consumer of this seam
// renders INSIDE the app's content root, and a token that root sees is not necessarily a token
// `documentElement` sees: a CUSTOM theme sets no `[data-theme]` at all — its palette rides `<ThemeScope>`'s
// INLINE custom properties over the shell grid and themed portal root, and the colorization rule
// redeclares `--color-border` on BOTH sibling branches below that inline carrier — so a `documentElement`
// read painted every canvas in the BASE palette while the DOM around it painted the custom one. The
// resolution root is therefore the element the app MARKS as its
// token root (`LIVE_TOKEN_ROOT_ATTRIBUTE`), falling back to `documentElement` where nothing marks one
// (a CT mount, a preview, any surface outside the shell) — which is byte-identical to the old behaviour.
//
// DOM-lib-free structural globals: this module (and every hook consumer) runs through the node
// typecheck lane, which follows the lib barrel here and has no `dom` lib — so DOM access rides
// `globalThis` cast through minimal STRUCTURAL types rather than the ambient `Document`/`Window`
// shapes (which don't structurally overlap these locals under a direct assertion, TS2352).

interface LiveResolverRootElement {
  readonly getPropertyValue?: unknown;
  readonly append?: (child: LiveResolverProbeElement) => void;
  /** The inline-style chain: an inline `--token` that reaches the root is declared on it or an ancestor. */
  readonly parentElement?: LiveResolverRootElement | null;
}
/** A throwaway element used to make the cascade resolve a token the way a real declaration would. */
interface LiveResolverProbeElement {
  readonly style: { color: string; position: string; paddingLeft: string };
  readonly remove: () => void;
}
/** A one-pixel 2D canvas the engine paints a resolved color into, so it converts every form it computes. */
interface LiveResolverPaintCanvas {
  width: number;
  height: number;
  readonly getContext: (contextId: "2d", settings: { readonly willReadFrequently: boolean }) => LiveResolverPaintContext | null;
}
interface LiveResolverPaintContext {
  fillStyle: string;
  readonly clearRect: (x: number, y: number, width: number, height: number) => void;
  readonly fillRect: (x: number, y: number, width: number, height: number) => void;
  readonly getImageData: (x: number, y: number, width: number, height: number) => { readonly data: ArrayLike<number> };
}
interface LiveResolverComputedStyle {
  readonly getPropertyValue: (property: string) => string;
}
interface LiveResolverObserverOptions {
  readonly attributes?: boolean;
  readonly attributeFilter?: string[];
  readonly childList?: boolean;
}
interface LiveResolverObserver {
  observe: (target: LiveResolverRootElement, options: LiveResolverObserverOptions) => void;
  disconnect: () => void;
}
interface LiveResolverGlobals {
  readonly document?: {
    readonly documentElement?: LiveResolverRootElement;
    readonly body?: LiveResolverRootElement;
    readonly head?: LiveResolverRootElement;
    readonly createElement?: ((tagName: "canvas") => LiveResolverPaintCanvas) & ((tagName: "span") => LiveResolverProbeElement);
    readonly querySelector?: (selectors: string) => LiveResolverRootElement | null;
    readonly fonts?: {
      readonly addEventListener: (event: "loadingdone", listener: () => void) => void;
      readonly removeEventListener: (event: "loadingdone", listener: () => void) => void;
    };
  };
  readonly getComputedStyle?: (element: LiveResolverRootElement | LiveResolverProbeElement) => LiveResolverComputedStyle;
  // biome-ignore lint/style/useNamingConvention: platform global name — mirrors real `globalThis`.
  readonly MutationObserver?: new (
    callback: () => void,
  ) => LiveResolverObserver;
}

// Cast via `unknown`: with the `dom` lib present, ambient globalThis shapes don't structurally overlap
// these minimal locals, so a direct assertion is rejected (TS2352).
const liveResolverGlobals = globalThis as unknown as LiveResolverGlobals;

/**
 * THE MARKER FOR THE APP'S TOKEN ROOT — the one element whose cascade position every canvas / foreign-realm
 * consumer of this seam actually paints in. The app stamps it on the shell grid
 * (`client/features/app-shell/surfaces/app-shell.tsx`), which is the deepest element that is an ANCESTOR of
 * every chart and every sandbox frame while still carrying the whole active palette: `<ThemeScope>`'s inline
 * custom properties reach it by inheritance, and the two declarations written below ThemeScope rather than
 * only on `<html>` (the colorization variant's `:is(.shell-grid, [data-slot="portal-root"])` rule in client globals.css) are seen
 * here exactly as a grid descendant sees them. The portal sibling carries the same declarations for floats;
 * canvases and foreign realms live under the marked grid, so the grid remains their correct read root.
 *
 * Marking is the APP'S call, not this module's: `@orb/ui` neither knows nor may know the shell's class
 * names, and a surface with no marked root (a CT mount, a preview, anything outside the shell) resolves
 * from `documentElement` exactly as it did before #504.
 */
export const LIVE_TOKEN_ROOT_ATTRIBUTE = "data-live-token-root";

const LIVE_TOKEN_ROOT_SELECTOR = `[${LIVE_TOKEN_ROOT_ATTRIBUTE}]`;

function markedRoot(): LiveResolverRootElement | null | undefined {
  return liveResolverGlobals.document?.querySelector?.(LIVE_TOKEN_ROOT_SELECTOR);
}

/** The element every read in this module resolves against (see `LIVE_TOKEN_ROOT_ATTRIBUTE`). */
function readRoot(): LiveResolverRootElement | undefined {
  return markedRoot() ?? liveResolverGlobals.document?.documentElement;
}

/** Read one CSS custom property off the resolution root via computed style. A root present but the var
 *  unset (`getPropertyValue` returns `""`) also falls back — empty isn't paintable. */
export function resolveCssVar(cssVar: string, fallback: string): string {
  const root = readRoot();
  if (root === undefined || liveResolverGlobals.getComputedStyle === undefined) {
    return fallback;
  }
  const resolved = liveResolverGlobals.getComputedStyle(root).getPropertyValue(cssVar).trim();
  return resolved === "" ? fallback : resolved;
}

// A color token through the cascade, not the custom property: `getPropertyValue` returns the token stream
// (`light-dark(...)`, D71), while a probe's computed `color` is concrete. The probe must be attached, inside the
// resolution root, and fixed so it opens no track in the root's grid. No DOM or an empty read yields `fallback`.
function resolveCssColor(cssVar: string, fallback: string): string {
  const host = markedRoot() ?? liveResolverGlobals.document?.body ?? liveResolverGlobals.document?.documentElement;
  const probe = liveResolverGlobals.document?.createElement?.("span");
  if (host?.append === undefined || probe === undefined || liveResolverGlobals.getComputedStyle === undefined) {
    return fallback;
  }
  probe.style.color = `var(${cssVar})`;
  probe.style.position = "fixed";
  host.append(probe);
  const resolved = liveResolverGlobals.getComputedStyle(probe).getPropertyValue("color").trim();
  probe.remove();
  return resolved === "" ? fallback : resolved;
}

const CHANNEL_MAX = 255;
// A fill value the engine rejects leaves `fillStyle` unchanged. Two distinct sentinels tell a rejection from
// a color that happens to equal one of them, so a rejected value can never repaint the previous role's color.
const FILL_SENTINELS = ["#010203", "#030201"] as const;
let paintContext: LiveResolverPaintContext | null = null;

// One CPU-backed pixel, created on first use. willReadFrequently keeps it off the accelerated canvas path.
function canvasPaintContext(): LiveResolverPaintContext | null {
  if (paintContext === null) {
    const canvas = liveResolverGlobals.document?.createElement?.("canvas");
    if (canvas !== undefined) {
      canvas.width = 1;
      canvas.height = 1;
      paintContext = canvas.getContext("2d", { willReadFrequently: true });
    }
  }
  return paintContext;
}

/**
 * Resolve a color token to the `rgba()` the engine itself paints for it on a 2D canvas.
 *
 * @remarks
 * A canvas library that interpolates colors in script (zrender, behind every ECharts chart) parses only legacy
 * sRGB, while the cascade serializes OKLCH, Lab, `color()` and `none` hues. Painting the cascade-resolved color
 * into one pixel and reading it back lets the engine convert every form it can compute, with its own gamut
 * handling, so no computed color is left unconvertible. Without a DOM or a 2D canvas, or for a value the
 * canvas rejects, it yields `fallback`.
 */
export function resolveCanvasColor(cssVar: string, fallback: string): string {
  const context = canvasPaintContext();
  if (context === null) {
    return fallback;
  }
  const color = resolveCssColor(cssVar, fallback);
  const accepted = FILL_SENTINELS.some((sentinel) => {
    context.fillStyle = sentinel;
    context.fillStyle = color;
    return context.fillStyle !== sentinel;
  });
  if (!accepted) {
    return fallback;
  }
  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, alpha = 0] = Array.from(context.getImageData(0, 0, 1, 1).data);
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha / CHANNEL_MAX)})`;
}

/** Resolve a dimension through the browser, including owner-authored calc(), rem scaling and the pixel belt. */
export function resolveCssLength(cssVar: string, fallback: number): number {
  const host = markedRoot() ?? liveResolverGlobals.document?.body ?? liveResolverGlobals.document?.documentElement;
  const probe = liveResolverGlobals.document?.createElement?.("span");
  if (host?.append === undefined || probe === undefined || liveResolverGlobals.getComputedStyle === undefined) {
    return fallback;
  }
  // Computed padding retains subpixel precision; a width read exposes the layout engine's rounded used value.
  probe.style.paddingLeft = `var(${cssVar})`;
  probe.style.position = "fixed";
  host.append(probe);
  const resolved = Number.parseFloat(liveResolverGlobals.getComputedStyle(probe).getPropertyValue("padding-left"));
  probe.remove();
  return Number.isFinite(resolved) ? resolved : fallback;
}

/**
 * THE ROOT ATTRIBUTES WHOSE FLIP MOVES A RESOLVED TOKEN — one home for every consumer of this seam, and
 * A COUPLED SITE FOR EVERY FUTURE APPEARANCE AXIS: an axis that redeclares a custom property at
 * `<html>` scope and is NOT listed here is invisible to every canvas/foreign realm on the page until it
 * remounts. That is not hypothetical — it is #503, measured (side-eye colorization pass, 2026-08-22):
 * this list was `["data-theme"]`, so toggling `appearance.enableThemeColorization` moved every DOM
 * hairline instantly while the analytics histograms stayed BYTE-IDENTICAL.
 *
 * The list is deliberately NOT a per-consumer parameter. "Which attributes move a token" is a property of
 * the CASCADE, not of who is reading it, so a consumer that watched a narrower set would simply be wrong.
 *
 * THE AUDIT, against every root attribute the shell writes (the client appearance channel,
 * `client/src/lib/appearance-carrier-manifest.ts`, written by its root effects and the pre-mount replay):
 *   • `data-theme` — WATCHED. The generated `[data-theme="…"]` blocks (`styles/theme.css`) redeclare the
 *     whole `--color-*` set at root scope.
 *   • `data-appearance-enable-theme-colorization` — WATCHED. Its `true` variant redeclares `--color-border` /
 *     `--color-sidebar-border` (`client/src/styles/globals.css`).
 *   • `data-density` — WATCHED on the root/ancestor chain. ThemeScope's density changes spacing tokens
 *     consumed by canvas chart geometry, even when its font and palette remain unchanged.
 *   • every other `data-appearance-*` attribute — each rule keyed on one applies a paint, layout or motion
 *     property to a non-root element, or a glass fill knob; none moves a token consumed by this resolver.
 *   • the root `style` attribute — carries registered appearance numbers, including the font scale that
 *     changes every rem-derived dimension; inline ThemeScope styles carry custom fonts and palettes.
 *   • `class` — nothing writes a class onto `<html>`; the Tailwind `dark` variant is `[data-theme]`-keyed.
 *
 * THIS LIST IS NOT THE WHOLE OBSERVER, and never could be (#504): a CUSTOM theme moves no root attribute
 * at all. Its palette rides `<ThemeScope>`'s INLINE custom properties above the marked root plus an injected
 * `<head><style>` (`custom-theme-style.tsx`). `subscribe` below therefore watches three channels, which
 * together are total over "what can move a token the resolution root sees":
 *   1. these attributes, on `documentElement` — the seed/appearance axes;
 *   2. the `style` attribute of the resolution root AND OF EVERY ANCESTOR up to `documentElement` — an
 *      inline declaration can only reach the root from that chain, and that is the channel a
 *      custom→custom flip (which changes no attribute anywhere else) travels down;
 *   3. `document.head` child mutations — the injected custom-theme stylesheet appearing, changing or
 *      being removed, which is a token move that touches no element in the chain at all.
 */
const TOKEN_MOVING_ROOT_ATTRIBUTES: readonly string[] = ["data-theme", "data-density", "data-appearance-enable-theme-colorization"];

export interface LiveTokenStore<T> {
  readonly subscribe: (onChange: () => void) => () => void;
  readonly getSnapshot: () => T;
  readonly getServerSnapshot: () => T;
}

const NO_UNSUBSCRIBE = (): void => undefined;

/**
 * A `useSyncExternalStore` triple for a live, theme-reactive resolved value. `resolve` computes the
 * concrete value from the current cascade; `fallback` is the SSR / no-DOM snapshot (also identity-stable,
 * per useSyncExternalStore's contract). Re-resolves on any mutation of the three channels audited above —
 * caches the resolved value between notifications and drops the cache on each observed mutation so the next
 * read re-resolves fresh.
 */
export function createLiveTokenStore<T>(resolve: () => T, fallback: T): LiveTokenStore<T> {
  let cached: T | null = null;

  function getSnapshot(): T {
    if (liveResolverGlobals.document?.documentElement === undefined) {
      return fallback;
    }
    cached ??= resolve();
    return cached;
  }

  function getServerSnapshot(): T {
    return fallback;
  }

  function subscribe(onChange: () => void): () => void {
    const root = readRoot();
    if (root === undefined || liveResolverGlobals.MutationObserver === undefined) {
      return NO_UNSUBSCRIBE;
    }
    // The first snapshot is taken during RENDER, when the consumer's own tree — and with it the marked
    // resolution root it mounts under — is not yet attached, so that value was resolved against whatever
    // root existed THEN. `subscribe` runs after commit, when it is; drop the cache so React's own
    // post-subscribe re-read resolves against the real root.
    cached = null;
    const invalidate = (): void => {
      cached = null;
      onChange();
    };
    const observer = new liveResolverGlobals.MutationObserver(invalidate);
    const attributeFilter = [...TOKEN_MOVING_ROOT_ATTRIBUTES, "style"];
    // Channels 1 + 2: the root and every ancestor of it, up to and including `documentElement`.
    for (let node: LiveResolverRootElement | undefined = root; node !== undefined; node = node.parentElement ?? undefined) {
      observer.observe(node, { attributes: true, attributeFilter });
    }
    // Channel 3: the injected custom-theme stylesheet.
    const head = liveResolverGlobals.document?.head;
    if (head !== undefined) {
      observer.observe(head, { childList: true });
    }
    const fonts = liveResolverGlobals.document?.fonts;
    fonts?.addEventListener("loadingdone", invalidate);
    return (): void => {
      observer.disconnect();
      fonts?.removeEventListener("loadingdone", invalidate);
    };
  }

  return { subscribe, getSnapshot, getServerSnapshot };
}
