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
  readonly style: { color: string; position: string };
  readonly remove: () => void;
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
    readonly createElement?: (tagName: string) => LiveResolverProbeElement;
    readonly querySelector?: (selectors: string) => LiveResolverRootElement | null;
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
 * only on `<html>` (`html[data-theme-colorization] :is(.shell-grid, [data-slot="portal-root"])`) are seen
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

/**
 * Resolve a token that must be a CONCRETE COLOR for a canvas / foreign realm.
 *
 * `resolveCssVar` returns a custom property's raw TOKEN STREAM, which for the 9 semantic-intent tokens
 * (D71 — they are `light-dark(<light>, <dark>)` literals) is a string no canvas can paint. Measured
 * 2026-08-19: `--color-destructive` reads back `light-dark(oklch(50% .19 25), oklch(65% .19 25))` through
 * `getPropertyValue`, while the SAME var resolves to `oklch(0.65 0.19 25)` once it flows through a real
 * `color` declaration. So this makes the cascade do the resolution: a probe element takes
 * `color: var(--token)` and its computed `color` is read back.
 *
 * The probe must be ATTACHED — computed style on a detached node is empty (a documented trap in this repo)
 * — and it attaches INSIDE the resolution root (#504), or it would resolve the root's cascade position
 * rather than the consumer's. `position: fixed` is not decoration: the marked root is a CSS GRID, and an
 * in-flow probe would open an implicit track for the lifetime of the read.
 * Falls back exactly like `resolveCssVar`: no DOM, or an unresolvable/empty read, yields `fallback`.
 */
export function resolveCssColor(cssVar: string, fallback: string): string {
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
 * THE AUDIT, against every root attribute the shell writes
 * (`client/features/app-shell/hooks/use-appearance-root-effects.ts` + the pre-mount replay in
 * `state/appearance-boot-hint.ts`) — the unwatched ones are unwatched because they provably cannot move a
 * token, not because nobody checked:
 *   • `data-theme` — WATCHED. The generated `[data-theme="…"]` blocks (`styles/theme.css`) redeclare the
 *     whole `--color-*` set at root scope.
 *   • `data-theme-colorization` — WATCHED (#503). `html[data-theme-colorization]` redeclares
 *     `--color-border` / `--color-sidebar-border` (`client/src/styles/globals.css`).
 *   • `data-blur-{panels,composer,messages,modals}` · `data-shadow` · `data-texture` ·
 *     `data-justify-body-text` · `data-reduced-motion` — every rule keyed on these is a DESCENDANT
 *     selector applying a paint/layout/motion property (`backdrop-filter`, `box-shadow`,
 *     `background-image`, `text-align`, `animation-duration`) to a non-root element. None declares a
 *     custom property, so no resolved token moves.
 *   • the root `style` attribute — carries `--font-scale`, `--blur-strength` and the `--reading-*` vars:
 *     numbers and lengths, never a colour or a font-family token.
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
const TOKEN_MOVING_ROOT_ATTRIBUTES: readonly string[] = ["data-theme", "data-theme-colorization"];

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
    const observer = new liveResolverGlobals.MutationObserver(() => {
      cached = null;
      onChange();
    });
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
    return (): void => observer.disconnect();
  }

  return { subscribe, getSnapshot, getServerSnapshot };
}
