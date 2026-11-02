// While the reader writes, a short room's end belongs to the composer: Send and the line being typed sit above the
// keyboard. A scroll position kept by the browser is not enough, because opening the keyboard shrinks the room from its
// bottom edge and a room that was not exactly at its end would leave the composer under the keyboard.

import type { RefObject } from "react";
import { useEffect } from "react";

/** Holds `roomRef`'s scroller at its end whenever focus is inside `composerRef`: on focus, and on every resize of the
 *  room or its parts (the keyboard opening, the composer growing as the draft wraps). A room that fits has no end. */
export function useRoomEndWhileWriting(roomRef: RefObject<HTMLElement | null>, composerRef: RefObject<HTMLElement | null>): void {
  useEffect((): (() => void) | undefined => {
    const room = roomRef.current;
    if (room === null) {
      return undefined;
    }
    const pin = (): void => {
      if (composerRef.current?.contains(document.activeElement) === true) {
        room.scrollTop = room.scrollHeight;
      }
    };
    const observer = new ResizeObserver(pin);
    observer.observe(room);
    for (const part of room.children) {
      observer.observe(part);
    }
    room.addEventListener("focusin", pin);
    return (): void => {
      observer.disconnect();
      room.removeEventListener("focusin", pin);
    };
  }, [roomRef, composerRef]);
}
