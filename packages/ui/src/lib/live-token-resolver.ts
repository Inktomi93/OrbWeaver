// The live-token-resolver seam (§14, 2026-08-09 report card): canvas/iframe realms can't resolve
// `var(--token)` — chart chrome (ECharts canvas) and the sandbox card frame (a null-origin srcdoc) both
// need CONCRETE token values, re-resolved via a MutationObserver on the root attributes that move a token
// (`TOKEN_MOVING_ROOT_ATTRIBUTES` below — its comment is the coverage audit), served through
// `useSyncExternalStore` so a Light/Dark switch repaints instead of baking a stale literal. Was three
// near-identical spellings (charts/use-chart-theme.ts, sandbox-frame/use-sandbox-theme.ts, web-weave's
// probe-element variant); this module is the ONE mechanics home — each consumer keeps its own token
// shape (ChartColors roles, SandboxThemeTokens, WeavePalette) as a thin projection over it.
//
// DOM-lib-free structural globals: this module (and every hook consumer) runs through the node
// typecheck lane, which follows the lib barrel here and has no `dom` lib — so DOM access rides
// `globalThis` cast through minimal STRUCTURAL types rather than the ambient `Document`/`Window`
// shapes (which don't structurally overlap these locals under a direct assertion, TS2352).

interface LiveResolverRootElement {
  readonly getPropertyValue?: unknown;
  readonly append?: (child: LiveResolverProbeElement) => void;
}
/** A throwaway element used to make the cascade resolve a token the way a real declaration would. */
interface LiveResolverProbeElement {
  readonly style: { color: string };
  readonly remove: () => void;
}
interface LiveResolverComputedStyle {
  readonly getPropertyValue: (property: string) => string;
}
interface LiveResolverObserverOptions {
  readonly attributes: boolean;
  readonly attributeFilter: string[];
}
interface LiveResolverObserver {
  observe: (target: LiveResolverRootElement, options: LiveResolverObserverOptions) => void;
  disconnect: () => void;
}
interface LiveResolverGlobals {
  readonly document?: {
    readonly documentElement?: LiveResolverRootElement;
    readonly body?: LiveResolverRootElement;
    readonly createElement?: (tagName: string) => LiveResolverProbeElement;
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

/** Read one CSS custom property off the document root via computed style. A root present but the var
 *  unset (`getPropertyValue` returns `""`) also falls back — empty isn't paintable. */
export function resolveCssVar(cssVar: string, fallback: string): string {
  const root = liveResolverGlobals.document?.documentElement;
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
 * The probe must be ATTACHED — computed style on a detached node is empty (a documented trap in this repo).
 * Falls back exactly like `resolveCssVar`: no DOM, or an unresolvable/empty read, yields `fallback`.
 */
export function resolveCssColor(cssVar: string, fallback: string): string {
  const host = liveResolverGlobals.document?.body ?? liveResolverGlobals.document?.documentElement;
  const probe = liveResolverGlobals.document?.createElement?.("span");
  if (host?.append === undefined || probe === undefined || liveResolverGlobals.getComputedStyle === undefined) {
    return fallback;
  }
  probe.style.color = `var(${cssVar})`;
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
 * OUT OF AN ATTRIBUTE OBSERVER'S REACH BY CONSTRUCTION (stated so the next reader does not mistake this
 * list for total coverage): a CUSTOM theme sets no `[data-theme]` at all — its tokens ride `<ThemeScope>`
 * on `.shell-grid` plus an injected `<head>` `<style>` (`custom-theme-style.tsx`), neither of which is a
 * root attribute, and neither of which this resolver's `documentElement` read can even see.
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
 * per useSyncExternalStore's contract). Re-resolves on any `TOKEN_MOVING_ROOT_ATTRIBUTES` mutation of
 * `documentElement` — caches the resolved value between notifications and drops the cache on each observed
 * mutation so the next read re-resolves fresh.
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
    const root = liveResolverGlobals.document?.documentElement;
    if (root === undefined || liveResolverGlobals.MutationObserver === undefined) {
      return NO_UNSUBSCRIBE;
    }
    const observer = new liveResolverGlobals.MutationObserver(() => {
      cached = null;
      onChange();
    });
    observer.observe(root, { attributes: true, attributeFilter: [...TOKEN_MOVING_ROOT_ATTRIBUTES] });
    return (): void => observer.disconnect();
  }

  return { subscribe, getSnapshot, getServerSnapshot };
}
