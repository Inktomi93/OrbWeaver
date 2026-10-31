// The chat rename controls' names that their specs locate. A zero-import leaf, so a spec's node side reads them
// without loading the component graph.

/** The topbar title button's verb and the rename dialog's title. */
export const RENAME_CHAT_NAME = "Rename chat";

/** The topbar's in-place rename field. */
export const CHAT_NAME_FIELD_NAME = "Chat name";

/** The rename dialog's title field. */
export const CHAT_TITLE_FIELD_NAME = "Chat title";

/** The stable head of the topbar title button's name: the verb, then who the room is with and the room's own name. A spec locates the button by this head, since the date after it changes. */
export function renameChatButtonIdentity(label: string, roomName: string | null): string {
  return `${RENAME_CHAT_NAME} — ${label}${roomName === null ? "" : `, ${roomName}`}`;
}

/** The topbar title button's name: its identity, then the date it shows (WCAG 2.5.3: the whole visible label is in the name). */
export function renameChatButtonName(label: string, roomName: string | null, date: string): string {
  return `${renameChatButtonIdentity(label, roomName)}, ${date}`;
}
