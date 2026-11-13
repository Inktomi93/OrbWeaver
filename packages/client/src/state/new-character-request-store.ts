// A request to open the new-character form from outside the Characters section (the command palette), the shape
// `connection-editor-request-store.ts` uses: the section owns the form, so the caller files the request and a host the
// section mounts in every layout takes it once. Ephemeral, never persisted. Pure state: the pure doors compile with no DOM,
// so where focus returns on close is the character feature's (`new-character-door.ts`).

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
 *  filed (the switch to Characters mounts it) still hears it. The listener is not selector-sliced: a slice remembered across
 *  the listener's own take would hold a stale `true` and miss the next request. */
export function onNewCharacterRequest(listener: () => void): () => void {
  const unsubscribe = useNewCharacterRequestStore.subscribe((state) => {
    if (state.requested) {
      listener();
    }
  });
  if (useNewCharacterRequestStore.getState().requested) {
    listener();
  }
  return unsubscribe;
}
