// Measure keyboard coverage against the consumer's CSS frame, because native keyboard animations can resize innerHeight separately.
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

/** Keyboard coverage in CSS pixels; pinch zoom and browser-chrome changes do not count as a keyboard. */
export function readKeyboardInset(layoutHeight = keyboardWindow.innerHeight): number {
  const viewport = keyboardWindow.visualViewport;
  if (
    viewport === null ||
    viewport === undefined ||
    layoutHeight === undefined ||
    viewport.scale !== 1 ||
    layoutHeight - viewport.height <= KEYBOARD_RESIZE_THRESHOLD
  ) {
    return 0;
  }
  const bottom = Math.min(layoutHeight, Math.max(0, viewport.offsetTop) + viewport.height);
  return Math.max(0, Math.ceil(layoutHeight - bottom));
}

/** Tracks a keyboard through browsers that finish resizing their own layout after the visual viewport changes. */
export function createKeyboardInsetReader(): (layoutHeight: number) => { readonly inset: number; readonly open: boolean } {
  let keyboardVisualHeight = -1;
  return (layoutHeight) => {
    const viewport = keyboardWindow.visualViewport;
    if (viewport === null || viewport === undefined || viewport.scale !== 1) {
      keyboardVisualHeight = -1;
      return { inset: 0, open: false };
    }
    if (layoutHeight - viewport.height > KEYBOARD_RESIZE_THRESHOLD) {
      keyboardVisualHeight = viewport.height;
    } else if (Math.abs(viewport.height - keyboardVisualHeight) > KEYBOARD_RESIZE_THRESHOLD) {
      keyboardVisualHeight = -1;
    }
    // A browser-sized frame needs no additional inset, but keyboard-specific room layout must remain active.
    return { inset: readKeyboardInset(layoutHeight), open: keyboardVisualHeight >= 0 };
  };
}

/** Subscribe to viewport size, pan and rotation changes; returns the unsubscribe. */
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
