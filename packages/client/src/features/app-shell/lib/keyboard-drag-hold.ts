// While the soft keyboard is up, the page holds still under a drag that nothing under the finger can scroll.
//
// WebKit on iOS keeps the layout viewport at full height under the keyboard, and the shell fits only the band above it
// (`--orb-keyboard-inset`). A drag that no scroller takes therefore pans the visual viewport over the empty band below the
// frame, and the whole screen slides under the finger. iOS lets a page stop that pan in one way: by cancelling the touchmove.
// `interactive-widget=resizes-content` in `packages/client/index.html` removes the band where a browser honours it, but WebKit
// does not, so it only complements this hold.
//
// A drag is cancelled only when no element from the touch target up can scroll in the drag's direction. A scroller at its end
// in that direction counts as unable, so the drag stops there instead of chaining into the page. Two or more touches pass (a
// pinch zoom), and so does a move the browser no longer lets the page cancel (a scroll already under way).
//
// LIMIT: no local tool shows the visual-viewport pan. Headless Chromium never pans for a keyboard and WebKitGTK has none, so
// `tests/client/features/app-shell/surfaces/keyboard-drag-hold.ct.tsx` proves which drags this cancels and which still scroll;
// that the iPhone screen holds still is checked on a real iPhone.

const SCROLLING_OVERFLOW: ReadonlySet<string> = new Set(["auto", "scroll", "overlay"]);
// Sub-pixel scroll ranges read as one short of the end.
const END_TOLERANCE = 1;

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Whether `element` scrolls along a finger move of `dx`, `dy`: a finger moving down scrolls content toward its top. */
function scrollsAlong(element: Element, dx: number, dy: number): boolean {
  const style = getComputedStyle(element);
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (!SCROLLING_OVERFLOW.has(style.overflowY) || element.scrollHeight <= element.clientHeight) {
      return false;
    }
    return dy > 0 ? element.scrollTop > 0 : element.scrollTop + element.clientHeight < element.scrollHeight - END_TOLERANCE;
  }
  if (!SCROLLING_OVERFLOW.has(style.overflowX) || element.scrollWidth <= element.clientWidth) {
    return false;
  }
  // `scrollLeft` runs from 0 at the inline start, negative in a right-to-left box, so its size is the distance from the start.
  const fromStart = Math.abs(element.scrollLeft);
  const towardStart = style.direction === "rtl" ? dx < 0 : dx > 0;
  return towardStart ? fromStart > 0 : fromStart + element.clientWidth < element.scrollWidth - END_TOLERANCE;
}

function anyScrollsAlong(target: EventTarget | null, dx: number, dy: number): boolean {
  for (let node = target instanceof Element ? target : null; node !== null; node = node.parentElement) {
    if (scrollsAlong(node, dx, dy)) {
      return true;
    }
  }
  return false;
}

/** Start holding the page still under drags no scroller takes; returns the release. */
export function holdPageUnderKeyboard(root: Document): () => void {
  let last: Point | null = null;
  const onStart = (event: TouchEvent): void => {
    const [touch] = event.touches;
    last = event.touches.length === 1 && touch !== undefined ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onMove = (event: TouchEvent): void => {
    const [touch] = event.touches;
    if (last === null || touch === undefined || event.touches.length !== 1) {
      return;
    }
    const dx = touch.clientX - last.x;
    const dy = touch.clientY - last.y;
    last = { x: touch.clientX, y: touch.clientY };
    if ((dx === 0 && dy === 0) || !event.cancelable || anyScrollsAlong(event.target, dx, dy)) {
      return;
    }
    event.preventDefault();
  };
  // A browser with no touch events (desktop Safari) has no drag to hold.
  if ("ontouchstart" in root) {
    root.addEventListener("touchstart", onStart, { passive: true });
  }
  if ("ontouchmove" in root) {
    // Not passive, which makes the browser wait on this listener before it scrolls; that cost is paid only while writing.
    root.addEventListener("touchmove", onMove, { passive: false });
  }
  return (): void => {
    root.removeEventListener("touchstart", onStart);
    root.removeEventListener("touchmove", onMove);
  };
}
