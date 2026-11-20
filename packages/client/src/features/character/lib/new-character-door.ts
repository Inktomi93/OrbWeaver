// Where focus returns when the new-character form closes after a request from another section: the New door of the current
// layout, which only a door mounted there can be. Every New door (the band's inline and compact forms, the phone trail's icon, the
// landing's button) hands its node over through `newCharacterDoorRef`, and `new-character-host.tsx` reads the one a reader can reach.

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
