// The HAND-ROLLED View Transition seam (UI-Arch §4a). The router's built-in VT fires only on URL
// commits — our pane swaps are reducer state changes at a constant `/`, so the router literally
// cannot drive them (UI-Lib-TanStack-Router.md C#3); this util is the one legal wrapper. Respects
// `prefers-reduced-motion` once here so no call site re-derives the check.
// DOM access rides `globalThis` with self-contained structural types (not the `dom` lib): the node
// typecheck lane (vitest `test:types`) follows imports into this file through the lib barrel, and
// the root tsconfig deliberately has no `dom` lib — browser reality is unchanged, the types are
// simply carried locally.

interface VtDocument {
  readonly startViewTransition?: (update: () => void) => unknown;
}
interface VtGlobals {
  readonly document?: VtDocument;
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
}

/**
 * Run a view-state update inside a View Transition when the platform supports it (and the user
 * hasn't asked for reduced motion) — otherwise apply the update directly. Fire-and-forget: the
 * caller never awaits the transition.
 */
export function withViewTransition(update: () => void): void {
  const g = globalThis as VtGlobals;
  const start = g.document?.startViewTransition;
  const reducedMotion = g.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  if (start === undefined || reducedMotion) {
    update();
    return;
  }
  start.call(g.document, update);
}
