// useRowDeleteFocus — where focus goes after a CONFIRMED row delete. The row's confirm closes over a trigger that the
// delete is about to unmount, so Base UI has nothing to return focus to and the page falls to <body>. This arms at the
// confirm, by row key, and answers the confirm's `finalFocus` for that row only: focus moves to the next row, else the
// previous one, else the list's root. A cancelled confirm, a click elsewhere and a list that shrinks for any other
// reason (a search, a refetch) never arm it, so nothing here can take focus the user has moved.
//
// The chosen row can be mounted again before the person does anything: the server's event that removes the deleted row can also
// change the list's container (a library that stops being virtualized), and the rows then mount in a new one. Until the person
// presses, types or focuses something, the chosen row takes focus back when it mounts and the page body holds it.

import type { RefCallback, RefObject } from "react";
import { useEffect, useRef } from "react";
import type { ConfirmDialogProps } from "./confirm-dialog.tsx";

/** A row action's confirm callback, as the confirm dialog types it. */
type DeleteRun = ConfirmDialogProps["onConfirm"];

const PERSON_ACTS = ["pointerdown", "keydown", "focusin"] as const;

export interface RowDeleteFocus {
  /** The row body's ref, so the next and previous rows can be focused by key. Virtualized rows that are not mounted are skipped. */
  readonly bodyRef: (key: string) => RefCallback<HTMLElement>;
  /** `onDelete` and `deleteFinalFocus` for the row's actions: spread both into `LibraryRowActions`. */
  readonly delete: (key: string, run: DeleteRun) => { readonly onDelete: DeleteRun; readonly deleteFinalFocus: () => boolean };
}

/** The row focus was handed to, and the listeners that end the hand-off the moment the person acts. */
interface Followed {
  readonly key: string;
  readonly stop: AbortController;
}

function endFollow(followed: { current: Followed | null }): void {
  followed.current?.stop.abort();
  followed.current = null;
}

/**
 * @param listRootRef - The list pane's root (the `ListPage` ref), where focus lands when no neighbour row is mounted.
 * @param keys - The row keys in display order, as the list renders them now.
 */
export function useRowDeleteFocus(listRootRef: RefObject<HTMLElement | null>, keys: readonly string[]): RowDeleteFocus {
  const bodies = useRef(new Map<string, HTMLElement>());
  const armed = useRef<{ readonly key: string; readonly neighbours: readonly string[] } | null>(null);
  const followed = useRef<Followed | null>(null);
  useEffect(
    () => (): void => {
      endFollow(followed);
    },
    [],
  );
  const follow = (key: string): void => {
    endFollow(followed);
    const stop = new AbortController();
    followed.current = { key, stop };
    for (const type of PERSON_ACTS) {
      document.addEventListener(type, () => endFollow(followed), { capture: true, signal: stop.signal });
    }
  };
  return {
    bodyRef:
      (key) =>
      (node): void => {
        if (node === null) {
          bodies.current.delete(key);
          return;
        }
        bodies.current.set(key, node);
        // A row's ref is attached again on every render, so only a mount that finds focus lost to the body is the remount this follows.
        if (followed.current?.key === key && document.activeElement === document.body) {
          node.focus();
          endFollow(followed);
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
