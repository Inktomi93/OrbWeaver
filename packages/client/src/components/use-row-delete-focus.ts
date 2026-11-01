// useRowDeleteFocus — where focus goes after a CONFIRMED row delete. The row's confirm closes over a trigger that the
// delete is about to unmount, so Base UI has nothing to return focus to and the page falls to <body>. This arms at the
// confirm, by row key, and answers the confirm's `finalFocus` for that row only: focus moves to the next row, else the
// previous one, else the list's root. A cancelled confirm, a click elsewhere and a list that shrinks for any other
// reason (a search, a refetch) never arm it, so nothing here can take focus the user has moved.

import type { RefCallback, RefObject } from "react";
import { useRef } from "react";
import type { ConfirmDialogProps } from "./confirm-dialog.tsx";

/** A row action's confirm callback, as the confirm dialog types it. */
type DeleteRun = ConfirmDialogProps["onConfirm"];

export interface RowDeleteFocus {
  /** The row body's ref, so the next and previous rows can be focused by key. Virtualized rows that are not mounted are skipped. */
  readonly bodyRef: (key: string) => RefCallback<HTMLElement>;
  /** `onDelete` and `deleteFinalFocus` for the row's actions: spread both into `LibraryRowActions`. */
  readonly delete: (key: string, run: DeleteRun) => { readonly onDelete: DeleteRun; readonly deleteFinalFocus: () => boolean };
}

/**
 * @param listRootRef - The list pane's root (the `ListPage` ref), where focus lands when no neighbour row is mounted.
 * @param keys - The row keys in display order, as the list renders them now.
 */
export function useRowDeleteFocus(listRootRef: RefObject<HTMLElement | null>, keys: readonly string[]): RowDeleteFocus {
  const bodies = useRef(new Map<string, HTMLElement>());
  const armed = useRef<{ readonly key: string; readonly neighbours: readonly string[] } | null>(null);
  return {
    bodyRef:
      (key) =>
      (node): void => {
        if (node === null) {
          bodies.current.delete(key);
        } else {
          bodies.current.set(key, node);
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
          const target = mine.neighbours.map((neighbour) => bodies.current.get(neighbour)).find((body) => body !== undefined) ?? listRootRef.current;
          if (target === null) {
            return true;
          }
          // Base UI reads this answer inside the dialog's own unmount, where a focus() is taken back to the trigger.
          queueMicrotask((): void => target.focus());
          return false;
        },
      };
    },
  };
}
