// A request to open the new-character form from outside the Characters section (the command palette), the shape
// `connection-editor-request-store.ts` uses: the section owns the form, so the caller files the request and a host the
// section mounts in every layout takes it once. Ephemeral, never persisted.
//
// The same module holds where focus goes when that form closes: the section's New door, which only a door mounted in the
// current layout can be. Doors register their node; the host reads them.

import { createGatedStore } from "./create-gated-store.ts";

interface NewCharacterRequestState {
  readonly requested: boolean;
}

const useNewCharacterRequestStore = createGatedStore<NewCharacterRequestState>("new-character-request", (): NewCharacterRequestState => ({ requested: false }));

export function requestNewCharacter(): void {
  useNewCharacterRequestStore.setState({ requested: true }, false, "newCharacterRequest/request");
}

/** Take the pending request. Two hosts can be mounted at once (the list and the content), so the take is the one place a
 *  request is spent: only the host that gets `true` opens the form. */
export function takeNewCharacterRequest(): boolean {
  if (!useNewCharacterRequestStore.getState().requested) {
    return false;
  }
  useNewCharacterRequestStore.setState({ requested: false }, false, "newCharacterRequest/take");
  return true;
}

/** Call `listener` for the pending request and for each one filed while subscribed. A host that mounts after the request was
 *  filed (the switch to Characters mounts it) still hears it. */
export function onNewCharacterRequest(listener: () => void): () => void {
  return useNewCharacterRequestStore.subscribe(
    (state) => state.requested,
    (requested) => {
      if (requested) {
        listener();
      }
    },
    { fireImmediately: true },
  );
}

const newCharacterDoors = new Set<HTMLElement>();

/** A New door's ref callback: holds the node while the door is mounted. */
export function newCharacterDoorRef(node: HTMLElement | null): (() => void) | undefined {
  if (node === null) {
    return undefined;
  }
  newCharacterDoors.add(node);
  return (): void => {
    newCharacterDoors.delete(node);
  };
}

/** The New door a reader can reach in this layout, or `null` where none is on screen. The band's measuring copy of a door is
 *  painted but inert, so it never takes focus. */
export function visibleNewCharacterDoor(): HTMLElement | null {
  return [...newCharacterDoors].find((node) => node.checkVisibility() && node.closest("[inert]") === null) ?? null;
}
