// WHERE THE APP'S TOAST STACK LANDS — one published DOM node, nothing more (#193).
//
// The toast outlet is mounted at the composition root, OUTSIDE `AppErrorBoundary` on purpose (a
// notification has to survive the crash-boundary swap that replaces the whole app tree). The BAND it
// should render into is a row of the shell's content column, which is inside the router, inside the error
// boundary, and several lazy chunks down. Those two facts cannot both be satisfied by nesting, so the
// shell PUBLISHES its band node here and the outlet portals into whatever is published.
//
// WHY A NODE AND NOT A FLAG. "Is a shell mounted?" would be a second source of truth about a thing the
// DOM already knows, and it would go stale in exactly the case that matters: the crash fallback swap,
// where the shell unmounts without anyone telling a store about it. The band's own cleanup clears this,
// so `null` means precisely "there is no band to render into right now" — the login screen, the crash
// fallback, the first commit before the shell's mount effect runs — and the outlet falls back to its
// fixed overlay placement, which is what a surface with nothing to reflow needs anyway.
//
// Device-transient by construction (a DOM node cannot be persisted or serialized); the store exists only
// so the outlet RE-RENDERS when the band appears or goes away.

import { createGatedStore } from "./create-gated-store.ts";

interface NoticeBandState {
  /** The shell's band host, or `null` when no shell is mounted. */
  readonly node: HTMLElement | null;
}

const useNoticeBandStore = createGatedStore<NoticeBandState>("notice-band", () => ({ node: null }));

/** The shell's band claims (or, with `null`, releases) the app's toast stack. Called from the band's own
 *  mount effect and its cleanup — never from anywhere else, so there is exactly one writer. */
export function publishNoticeBand(node: HTMLElement | null): void {
  if (useNoticeBandStore.getState().node === node) {
    return;
  }
  useNoticeBandStore.setState({ node }, false, "noticeBand/publish");
}

/** The band host the toast outlet should portal into, or `null` for the fixed-overlay fallback. */
export function useNoticeBand(): HTMLElement | null {
  return useNoticeBandStore((s) => s.node);
}
