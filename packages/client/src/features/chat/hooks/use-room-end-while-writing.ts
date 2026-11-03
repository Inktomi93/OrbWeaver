// Writing holds the room's end above the keyboard. Composer actions reveal their own box instead,
// so focusing a utility never scrolls it out of reach.

import type { RefObject } from "react";
import { useEffect } from "react";

/** Keep writing at the room's end and reveal composer controls on focus or resize. */
export function useRoomEndWhileWriting(roomRef: RefObject<HTMLElement | null>, composerRef: RefObject<HTMLElement | null>): void {
  useEffect((): (() => void) | undefined => {
    const room = roomRef.current;
    if (room === null) {
      return undefined;
    }
    const pin = (): void => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || composerRef.current?.contains(active) !== true) {
        return;
      }
      if (active instanceof HTMLTextAreaElement) {
        room.scrollTop = room.scrollHeight;
        return;
      }
      const box = active.getBoundingClientRect();
      const top = room.getBoundingClientRect().top + room.clientTop;
      const bottom = top + room.clientHeight;
      room.scrollTop += Math.min(0, box.top - top) + Math.max(0, box.bottom - bottom);
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
