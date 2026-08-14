// The live-token-resolver seam (§14, 2026-08-09 report card): canvas/iframe realms can't resolve
// `var(--token)` — chart chrome (ECharts canvas) and the sandbox card frame (a null-origin srcdoc) both
// need CONCRETE token values, re-resolved on a `data-theme` flip via a MutationObserver, served through
// `useSyncExternalStore` so a Light/Dark switch repaints instead of baking a stale literal. Was three
// near-identical spellings (charts/use-chart-theme.ts, sandbox-frame/use-sandbox-theme.ts, web-weave's
// probe-element variant); this module is the ONE mechanics home — each consumer keeps its own token
// shape (ChartColors roles, SandboxThemeTokens, WeavePalette) as a thin projection over it.
//
// DOM-lib-free structural globals: this module (and every hook consumer) runs through the node
// typecheck lane, which follows the lib barrel here and has no `dom` lib — so DOM access rides
// `globalThis` cast through minimal STRUCTURAL types rather than the ambient `Document`/`Window`
// shapes (which don't structurally overlap these locals under a direct assertion, TS2352).

export interface LiveResolverRootElement {
  readonly getPropertyValue?: unknown;
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
  readonly document?: { readonly documentElement?: LiveResolverRootElement };
  readonly getComputedStyle?: (element: LiveResolverRootElement) => LiveResolverComputedStyle;
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

export interface LiveTokenStore<T> {
  readonly subscribe: (onChange: () => void) => () => void;
  readonly getSnapshot: () => T;
  readonly getServerSnapshot: () => T;
}

const NO_UNSUBSCRIBE = (): void => undefined;

/**
 * A `useSyncExternalStore` triple for a live, theme-reactive resolved value. `resolve` computes the
 * concrete value from the current cascade; `fallback` is the SSR / no-DOM snapshot (also identity-stable,
 * per useSyncExternalStore's contract). Re-resolves on any `documentElement` attribute in
 * `attributeFilter` (chart/sandbox watch `["data-theme"]` only) — caches the resolved value between
 * notifications and drops the cache on each observed mutation so the next read re-resolves fresh.
 */
export function createLiveTokenStore<T>(resolve: () => T, fallback: T, attributeFilter: readonly string[]): LiveTokenStore<T> {
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
    observer.observe(root, { attributes: true, attributeFilter: [...attributeFilter] });
    return (): void => observer.disconnect();
  }

  return { subscribe, getSnapshot, getServerSnapshot };
}
