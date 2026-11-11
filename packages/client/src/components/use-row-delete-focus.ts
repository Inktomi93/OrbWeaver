// useRowDeleteFocus — the one owner of where focus goes when a list's focused row or the row a member was opened from
// leaves the page: a confirmed delete, a container that remounts its rows, and a member's Back.
//
// A confirmed delete. The row's confirm closes over a trigger that the delete is about to unmount, so Base UI has nothing to
// return focus to and the page falls to <body>. This arms at the confirm, by row key, and answers the confirm's `finalFocus`
// for that row only: focus moves to the next row, else the previous one, else the list's root. A cancelled confirm, a click
// elsewhere and a list that shrinks for any other reason (a search, a refetch) never arm it, so nothing here can take focus
// the user has moved.
//
// A remount. A row that holds focus when its body detaches is followed: when the same key mounts again (a list that changes
// its container, a window that scrolls the row back) and the page body holds focus, the row takes it back. The follow ends at
// the person's next press, key or focus, so it never takes focus they have moved.
//
// A member's Back (`returnFocusToRow`). The member's editor may replace its list, so the row may not be mounted when Back is
// pressed. The list that knew the key answers: a mounted row takes focus; a row outside the list's window is brought into it
// and takes focus as it mounts; a key the list no longer holds lands on the list's root. A list that is not mounted answers when
// it mounts. Mounted lists register in module state, because the member asking is not inside the list it asks.

import type { VirtualListHandle } from "@orb/ui/virtual-list";
import type { RefCallback, RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import type { ConfirmDialogProps } from "./confirm-dialog.tsx";

/** A row action's confirm callback, as the confirm dialog types it. */
type DeleteRun = ConfirmDialogProps["onConfirm"];

const PERSON_ACTS = ["pointerdown", "keydown", "focusin"] as const;

export interface RowDeleteFocus {
  /** The row body's ref, so rows can be focused by key. Virtualized rows that are not mounted are skipped. */
  readonly bodyRef: (key: string) => RefCallback<HTMLElement>;
  /** `onDelete` and `deleteFinalFocus` for the row's actions: spread both into `LibraryRowActions`. */
  readonly delete: (key: string, run: DeleteRun) => { readonly onDelete: DeleteRun; readonly deleteFinalFocus: () => boolean };
}

/** The row focus was handed to, and the listeners that end the hand-off the moment the person acts. */
interface Followed {
  readonly key: string;
  readonly stop: AbortController;
}

interface FollowHolder {
  current: Followed | null;
}

function endFollow(followed: FollowHolder): void {
  followed.current?.stop.abort();
  followed.current = null;
}

function startFollow(followed: FollowHolder, key: string): void {
  endFollow(followed);
  const stop = new AbortController();
  followed.current = { key, stop };
  for (const type of PERSON_ACTS) {
    document.addEventListener(type, () => endFollow(followed), { capture: true, signal: stop.signal });
  }
}

/** A mounted list, as a Back's request reaches it. */
interface ReturnTarget {
  /** Whether the list has ever rendered this key. */
  readonly knew: (key: string) => boolean;
  /** Focus the row, bring it into the window, or land on the root when the key is gone. */
  readonly answer: (key: string) => void;
}

// The row a member's Back wants focused, the control that asked, and the lists that can answer it. A host that draws the next
// view's Back in the same place keeps the asking control mounted, so focus may move from it as well as from the page body.
const returning: FollowHolder = { current: null };
let returnAskedFrom: Element | null = null;
const mountedLists = new Set<ReturnTarget>();

/** Ask for focus on the row `key`, the one a member was opened from. Call it from the Back's own handler, right before the
 *  member closes. A mounted list that rendered the key answers now; otherwise the next list to mount answers. The request ends
 *  at the person's next press, key or focus. */
export function returnFocusToRow(key: string): void {
  returnAskedFrom = document.activeElement;
  startFollow(returning, key);
  for (const list of mountedLists) {
    if (list.knew(key)) {
      list.answer(key);
      return;
    }
  }
}

function bodyHoldsFocus(): boolean {
  return document.activeElement === document.body;
}

// Focus is free for a Back's row while it sits on the page body or still on the control that asked.
function returnMayTakeFocus(): boolean {
  return bodyHoldsFocus() || (returnAskedFrom !== null && document.activeElement === returnAskedFrom);
}

/**
 * @param listRootRef - The list's root, focusable: where focus lands when no row can take it.
 * @param keys - The row keys in display order, as the list renders them now.
 * @param windowRef - The list's `VirtualList`, when it has one: a requested row outside the window is scrolled into it.
 */
export function useRowDeleteFocus(
  listRootRef: RefObject<HTMLElement | null>,
  keys: readonly string[],
  windowRef?: RefObject<VirtualListHandle | null>,
): RowDeleteFocus {
  const bodies = useRef(new Map<string, HTMLElement>());
  const armed = useRef<{ readonly key: string; readonly neighbours: readonly string[] } | null>(null);
  const followed = useRef<Followed | null>(null);
  const shown = useRef<readonly string[]>(keys);
  const seen = useRef(new Set<string>());

  // Before any effect reads them: a Back's request answered in this commit reads the keys this render shows.
  useLayoutEffect(() => {
    shown.current = keys;
    for (const key of keys) {
      seen.current.add(key);
    }
  });

  useLayoutEffect(() => {
    const answer = (key: string): void => {
      const body = bodies.current.get(key);
      if (body !== undefined) {
        body.focus();
        endFollow(returning);
      } else if (shown.current.includes(key)) {
        // The row mounts as the window reaches it, and its body ref takes focus then.
        windowRef?.current?.scrollToKey(key);
      } else {
        listRootRef.current?.focus();
        endFollow(returning);
      }
    };
    const target: ReturnTarget = { knew: (key) => seen.current.has(key), answer };
    mountedLists.add(target);
    // A request made while no list that knew its row was mounted: this list mounted as the member closed.
    const pending = returning.current?.key;
    if (pending !== undefined && returnMayTakeFocus()) {
      answer(pending);
    }
    return (): void => {
      mountedLists.delete(target);
      endFollow(followed);
    };
  }, [listRootRef, windowRef]);

  const follow = (key: string): void => {
    startFollow(followed, key);
  };
  return {
    bodyRef:
      (key) =>
      (node): void => {
        if (node === null) {
          // A focused row is leaving: follow it, so the row that mounts under the same key takes focus back.
          if (bodies.current.get(key) === document.activeElement && followed.current?.key !== key) {
            follow(key);
          }
          bodies.current.delete(key);
          return;
        }
        bodies.current.set(key, node);
        // A row's ref is attached again on every render, so only a mount that finds focus lost to the body is the remount this follows.
        if ((followed.current?.key === key && bodyHoldsFocus()) || (returning.current?.key === key && returnMayTakeFocus())) {
          // A windowed row attaches before the window writes its position, so a scrolling focus would scroll to where it sits
          // unplaced, the window's top. The window already brought the row into view.
          node.focus({ preventScroll: true });
          endFollow(followed);
          endFollow(returning);
        }
      },
    delete: (key, run): ReturnType<RowDeleteFocus["delete"]> => {
      const at = keys.indexOf(key);
      const neighbours = [keys[at + 1], keys[at - 1]].filter((neighbour) => neighbour !== undefined);
      return {
        onDelete: (): void | Promise<void> => {
          armed.current = { key, neighbours };
          const settled = run();
          if (settled instanceof Promise) {
            return settled.catch((error: unknown) => {
              armed.current = null;
              throw error;
            });
          }
          return settled;
        },
        deleteFinalFocus: (): boolean => {
          const mine = armed.current;
          if (mine?.key !== key) {
            return true;
          }
          armed.current = null;
          // Base UI reads this answer inside the dialog's own unmount, where a focus() is taken back to the trigger, so the
          // answer is `false` and the focus moves after the commit. The target is looked up then too: a commit that re-renders
          // the rows has detached every body ref by the time the dialog unmounts and reattaches them only after.
          queueMicrotask((): void => {
            const chosen = mine.neighbours.find((neighbour) => bodies.current.has(neighbour));
            (chosen === undefined ? listRootRef.current : bodies.current.get(chosen))?.focus();
            if (chosen !== undefined) {
              follow(chosen);
            }
          });
          return false;
        },
      };
    },
  };
}
