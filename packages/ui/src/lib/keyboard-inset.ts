// THE VIRTUAL-KEYBOARD INSET — how many CSS pixels of the layout viewport the soft keyboard is currently
// covering. Platform measurement only: no React, no DOM writes, no knowledge of who consumes it. The
// `coarse-pointer-now.ts` species (a lib capability reader) with the subscription half that
// `use-prefers-reduced-motion.ts` establishes, split into read + subscribe rather than shipped as a hook
// because its one consumer writes a CSS custom property imperatively and must NOT re-render a tree on every
// viewport event (the shell's own `use-appearance-root-effects` is that write pattern).
//
// WHY THIS EXISTS AT ALL. `interactive-widget=resizes-content` in the viewport meta is the declarative
// answer and WebKit has never implemented it (https://bugs.webkit.org/show_bug.cgi?id=259770, open);
// Safari ships no Virtual Keyboard API either, so `env(keyboard-inset-*)` is not a fallback. And `dvh`/`svh`
// are NOT shrunk by the keyboard on ANY browser — dynamic viewport units track browser chrome and nothing
// else. So on iOS the layout viewport, and `100dvh` with it, reports full height while the keyboard covers
// the composer and the tab bar. `visualViewport` is the only surface that can see it, which is what §4b
// axis 4 anticipates in as many words: "the `visualViewport` API only for precise composer-pinning if ever
// needed."
//
// THE ARITHMETIC AND ITS TWO GUARDS ARE BASE UI'S, NOT A BLOG POST'S — read off their shipped
// `DrawerVirtualKeyboardProvider` (@base-ui/react 1.7.0), which is the same measurement one layer up and is
// the reason we can afford to be this short. Every community snippet computes `innerHeight - vv.height` and
// stops; both guards below are the difference between a measurement and a guess:
//
//   · SCALE. When the user has pinch-zoomed, `visualViewport` describes the ZOOM, not the keyboard, and the
//     difference is enormous and meaningless. Bail to 0. This matters here more than anywhere: #1868 was a
//     zoom bug, and a keyboard mechanism that mistook leftover zoom for a keyboard would fight the very
//     state it exists downstream of.
//   · THRESHOLD. A shrink under 60px is browser chrome collapsing, not a keyboard. Without it, every scroll
//     that retracts a URL bar reads as a tiny keyboard and the consumer twitches.
//
// `offsetTop` is in the sum because iOS SCROLLS the visual viewport to reveal the focused field rather than
// only shrinking it, so the covered band is measured from the visual viewport's BOTTOM edge against the
// layout viewport's, not from the height difference alone.
//
// `lib/` compiles without the DOM lib (the `use-prefers-reduced-motion.ts` note), so every browser global is
// reached through a minimal structural type. Absent `visualViewport` — SSR, jsdom, a non-browser runner,
// and every desktop browser that has no soft keyboard — the reader answers 0 and the subscription is inert,
// which is the correct answer rather than a degraded one.

/** A shrink smaller than this is browser chrome retracting, not a keyboard. Base UI uses the same 60. */
const KEYBOARD_RESIZE_THRESHOLD = 60;

interface VisualViewportLike {
  readonly height: number;
  readonly offsetTop: number;
  readonly scale: number;
  readonly addEventListener: (type: "resize" | "scroll", listener: () => void) => void;
  readonly removeEventListener: (type: "resize" | "scroll", listener: () => void) => void;
}
interface KeyboardWindowLike {
  readonly innerHeight?: number;
  readonly visualViewport?: VisualViewportLike | null;
  readonly addEventListener?: (type: "resize" | "orientationchange", listener: () => void) => void;
  readonly removeEventListener?: (type: "resize" | "orientationchange", listener: () => void) => void;
}

const keyboardWindow = globalThis as KeyboardWindowLike;

/**
 * CSS pixels of the layout viewport currently covered by the soft keyboard; `0` when there is no keyboard,
 * no `visualViewport`, or the page is pinch-zoomed (where the measurement means nothing).
 */
export function readKeyboardInset(): number {
  const viewport = keyboardWindow.visualViewport;
  const innerHeight = keyboardWindow.innerHeight;
  if (viewport === undefined || viewport === null || innerHeight === undefined) {
    return 0;
  }
  // Pinch-zoom makes every number below describe the zoom instead of the keyboard.
  if (viewport.scale !== 1) {
    return 0;
  }
  if (innerHeight - viewport.height <= KEYBOARD_RESIZE_THRESHOLD) {
    return 0;
  }
  const top = Math.max(0, viewport.offsetTop);
  const bottom = Math.min(innerHeight, top + viewport.height);
  return Math.max(0, Math.ceil(innerHeight - bottom));
}

/**
 * Calls `onChange` whenever the keyboard inset may have changed. Returns the unsubscribe.
 *
 * BOTH `resize` AND `scroll` on the visual viewport: iOS moves the visual viewport by SCROLLING it to the
 * focused field as well as by resizing it, and a resize-only subscription misses the whole second half.
 * The window's own `resize`/`orientationchange` are there for the rotate case, where `innerHeight` — the
 * other half of the arithmetic — is what changed.
 */
export function subscribeKeyboardInset(onChange: () => void): () => void {
  const viewport = keyboardWindow.visualViewport;
  viewport?.addEventListener("resize", onChange);
  viewport?.addEventListener("scroll", onChange);
  keyboardWindow.addEventListener?.("resize", onChange);
  keyboardWindow.addEventListener?.("orientationchange", onChange);
  return (): void => {
    viewport?.removeEventListener("resize", onChange);
    viewport?.removeEventListener("scroll", onChange);
    keyboardWindow.removeEventListener?.("resize", onChange);
    keyboardWindow.removeEventListener?.("orientationchange", onChange);
  };
}
