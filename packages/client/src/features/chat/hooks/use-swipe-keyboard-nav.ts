// `useSwipeKeyboardNav` — a scoped `globalThis` ArrowLeft/ArrowRight listener for the swipe strip. No
// global keyboard-shortcut seam exists in the client yet (chat is the first feature to need one; #23's
// `CHAT_SURFACE_SLOTS` registry is a different mechanism — slot CONTENT, not a key-dispatch bus), so this
// is a narrowly-scoped listener installed only while the strip itself is mounted — which already only
// happens for the tail assistant message outside a stream/edit (message-list-surface.tsx's `showSwipes`
// gate, read-only from here; this hook adds no visibility gating of its own).
//
// "Don't fight the composer's own keys": while focus sits in ANY editable control (the composer's
// textarea today, a future inline editor, …) the browser's native Left/Right caret movement must win, so
// the listener no-ops whenever the event target OR `document.activeElement` is editable. There is no
// cross-lane seam exposing the composer's DRAFT TEXT (composer.tsx / chat-room-surface.tsx lift it as
// local component state, owned by a different lane this task doesn't touch), so "composer empty" narrows
// to "composer not focused" here — the conservative reading: a global shortcut fires chat-wide unless the
// user is actively typing, same as ST/neo's key handling. Flagged as a judgment call, not a guess to stop
// on — the alternative (reading the composer's textarea value through a DOM query) would be a brittler,
// implementation-detail-coupled hack for a marginal edge case.

import { useEffect } from "react";

export interface SwipeKeyboardNavHandlers {
  readonly onPrev: () => void;
  readonly onNext: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

/** Installs a `globalThis` ArrowLeft/ArrowRight listener for the strip's lifetime. `onPrev`/`onNext` are
 *  responsible for their own enablement (a no-op callback when the step isn't available) — this hook is
 *  pure key-routing, not affordance logic. */
export function useSwipeKeyboardNav({ onPrev, onNext }: SwipeKeyboardNavHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
      }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return (): void => globalThis.removeEventListener("keydown", onKeyDown);
  }, [onPrev, onNext]);
}
