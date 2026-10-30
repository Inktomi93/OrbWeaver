// The Characters create doors as requests: the mounted door cluster owns its two dialogs and listens here, so the
// overflow menu of a row that moved the cluster out of reach opens the same dialogs the inline buttons do.

export type CharacterDoor = "import" | "create";

const listeners = new Set<(door: CharacterDoor) => void>();

/** Ask the mounted door cluster to open `door`'s dialog. */
export function requestCharacterDoor(door: CharacterDoor): void {
  for (const listener of listeners) {
    listener(door);
  }
}

/** The door cluster's side: returns the unsubscribe. */
export function subscribeCharacterDoors(listener: (door: CharacterDoor) => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}
